from constructs import Construct
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_lambda as _lambda,
    aws_lambda_python_alpha as lambda_python,  # optional, if you prefer bundling
    aws_iam as iam,
    aws_apigateway as apigw,
    aws_cognito as cognito,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_events as events,
    aws_events_targets as targets,
)

class SchedulerStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # 1) DynamoDB single-table
        table = dynamodb.Table(
            self, "AppTable",
            partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,  # on-demand (cheap for low traffic)
            removal_policy=RemovalPolicy.DESTROY,               # dev convenience; use RETAIN in prod
            point_in_time_recovery=True
        )
        # GSI for events by time (startISO)
        table.add_global_secondary_index(
            index_name="GSI1",
            partition_key=dynamodb.Attribute(name="gsi1pk", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="gsi1sk", type=dynamodb.AttributeType.STRING)
        )

        # 2) Cognito User Pool (simple defaults)
        user_pool = cognito.UserPool(
            self, "UserPool",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True),
            password_policy=cognito.PasswordPolicy(min_length=8),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            removal_policy=RemovalPolicy.DESTROY
        )
        user_pool_client = user_pool.add_client("WebClient",
            auth_flows=cognito.AuthFlow(user_password=True, user_srp=True),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(implicit_code_grant=True),
                callback_urls=["http://localhost:5173", "https://your-frontend-domain"],  # adjust later
                logout_urls=["http://localhost:5173"]
            )
        )

        # 3) Lambda (Python) — API handler
        # Option A: Use aws_lambda.Function and layer/zip yourself
        # Option B: Use aws_lambda_python_alpha for automatic bundling
        api_lambda = _lambda.Function(
            self, "ApiLambda",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="app.handler",
            code=_lambda.Code.from_asset("../backend/handler"),
            timeout=Duration.seconds(10),
            memory_size=256,
            environment={
                "TABLE_NAME": table.table_name,
                "USER_POOL_ID": user_pool.user_pool_id
            }
        )

        # DynamoDB access for lambda (least privilege)
        table.grant_read_write_data(api_lambda)

        # 4) API Gateway REST API with Lambda proxy
        api = apigw.LambdaRestApi(
            self, "HttpApi",
            handler=api_lambda,
            proxy=True,
            deploy_options=apigw.StageOptions(
                stage_name="prod",
                throttling_rate_limit=50,
                throttling_burst_limit=100
            )
        )

        # 5) S3 + CloudFront for SPA hosting

        site_bucket = s3.Bucket(
            self, "SiteBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.DESTROY,   # change to RETAIN for prod
            auto_delete_objects=True,               # dev convenience
        )

        # CloudFront OAI (legacy but simple & secure)
        oai = cloudfront.OriginAccessIdentity(self, "SiteOAI")

        # Distribution with SPA fallback
        distribution = cloudfront.Distribution(
            self, "WebDistribution",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3Origin(site_bucket, origin_access_identity=oai),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            ),
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(0),
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(0),
                ),
            ],
        )


        # 6) EventBridge — daily placeholder (for future digests)
        rule = events.Rule(
            self, "DailyRule",
            schedule=events.Schedule.rate(Duration.days(1))
        )
        rule.add_target(targets.LambdaFunction(api_lambda))  # call same lambda for now (no-op route)

        # Outputs (visible in CloudFormation)
        from aws_cdk import CfnOutput
        CfnOutput(self, "ApiUrl", value=api.url)
        CfnOutput(self, "BucketName", value=site_bucket.bucket_name)
        CfnOutput(self, "CloudFrontURL", value=f"https://{distribution.domain_name}")
        CfnOutput(self, "UserPoolId", value=user_pool.user_pool_id)
        CfnOutput(self, "UserPoolClientId", value=user_pool_client.user_pool_client_id)

