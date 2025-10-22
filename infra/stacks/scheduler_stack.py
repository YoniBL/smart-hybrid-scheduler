# infra/stacks/scheduler_stack.py

from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_iam as iam,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
    aws_cognito as cognito,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_dynamodb as dynamodb,
    aws_events as events,
    aws_events_targets as targets,
)
from constructs import Construct


class SchedulerStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # =========
        # Context
        # =========
        stack_name_ctx = self.node.try_get_context("stackName") or "SmartHybridScheduler"
        enable_cloudfront_ctx = self.node.try_get_context("enableCloudFront")
        if enable_cloudfront_ctx is None:
            enable_cloudfront_ctx = True  # default: enable

        # Hosted UI domain prefix (set in cdk.json context if you like)
        cognito_domain_prefix = self.node.try_get_context("cognitoDomainPrefix") or "yonibl-scheduler-app"

        # =========
        # DynamoDB
        # =========
        table = dynamodb.Table(
            self,
            "AppTable",
            partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            removal_policy=RemovalPolicy.DESTROY,  # dev-friendly; switch to RETAIN for prod
        )
        # GSI used to query by time range (backend expects gsi1pk/gsi1sk)
        table.add_global_secondary_index(
            index_name="gsi1",
            partition_key=dynamodb.Attribute(name="gsi1pk", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="gsi1sk", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )



        # ============================
        # Frontend: S3 + CloudFront
        # ============================
        site_bucket = s3.Bucket(
            self,
            "SiteBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            auto_delete_objects=True,               # dev-friendly; remove for prod
            removal_policy=RemovalPolicy.DESTROY,   # dev-friendly; switch to RETAIN for prod
        )

        # CloudFront OAI to access private S3
        oai = cloudfront.OriginAccessIdentity(self, "SiteOAI")

        # Allow the OAI to read objects from the bucket (fixes CloudFront 403s)
        site_bucket.add_to_resource_policy(
            iam.PolicyStatement(
                sid="AllowCloudFrontOAIRead",
                actions=["s3:GetObject"],
                resources=[site_bucket.arn_for_objects("*")],
                principals=[
                    iam.CanonicalUserPrincipal(oai.cloud_front_origin_access_identity_s3_canonical_user_id)
                ],
            )
        )

        # CloudFront distribution with SPA fallbacks
        distribution = None
        if enable_cloudfront_ctx:
            distribution = cloudfront.Distribution(
                self,
                "SiteDistribution",
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
                        ttl=Duration.seconds(0),
                    ),
                    cloudfront.ErrorResponse(
                        http_status=404,
                        response_http_status=200,
                        response_page_path="/index.html",
                        ttl=Duration.seconds(0),
                    ),
                ],
            )

        # URLs for CORS / OAuth callbacks
        localhost = "http://localhost:5173"
        frontend_https = f"https://{distribution.domain_name}" if distribution else localhost

        # =========
        # Cognito
        # =========
        user_pool = cognito.UserPool(
            self,
            "UserPool",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True),
            password_policy=cognito.PasswordPolicy(min_length=8),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            removal_policy=RemovalPolicy.DESTROY,  # dev-friendly; switch to RETAIN for prod
        )

        # Hosted UI domain
        cognito_domain = user_pool.add_domain(
            "CognitoDomain",
            cognito_domain=cognito.CognitoDomainOptions(domain_prefix=cognito_domain_prefix),
        )

        # SPA client: Authorization Code Grant + PKCE (no client secret)
        user_pool_client = cognito.UserPoolClient(
            self,
            "UserPoolClient",
            user_pool=user_pool,
            generate_secret=False,  # SPA must not have a client secret
            # Direct username/password flows optional if only using Hosted UI; harmless to keep
            auth_flows=cognito.AuthFlow(user_password=True, user_srp=True),
            prevent_user_existence_errors=True,
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(authorization_code_grant=True),  # PKCE-capable
                callback_urls=[localhost, frontend_https],                 # Hosted UI returns here
                logout_urls=[localhost, frontend_https],                   # Hosted UI logout returns here
                scopes=[cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
            ),
            supported_identity_providers=[cognito.UserPoolClientIdentityProvider.COGNITO],
        )

        # =============
        # Lambda (API)
        # =============
        api_lambda = _lambda.Function(
            self,
            "ApiLambda",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="app.handler",
            code=_lambda.Code.from_asset("../backend/handler"),
            memory_size=256,
            timeout=Duration.seconds(10),
            environment={
                "TABLE_NAME": table.table_name,
                "ALLOW_DEV_AUTH": "false",  # flip to "true" only for local/dev scenarios
                "USER_POOL_ID": user_pool.user_pool_id,
                "USER_POOL_CLIENT_ID": user_pool_client.user_pool_client_id,
            },
        )
        table.grant_read_write_data(api_lambda)

        # ==========================
        # API Gateway + Authorizer
        # ==========================
        authorizer = apigw.CognitoUserPoolsAuthorizer(
            self, "ApiUserAuthorizer", cognito_user_pools=[user_pool]
        )

        api = apigw.LambdaRestApi(
            self,
            "Api",
            handler=api_lambda,
            proxy=True,
            deploy_options=apigw.StageOptions(
                stage_name="prod",
                throttling_rate_limit=50,
                throttling_burst_limit=100,
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=[localhost, frontend_https],
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
            ),
            default_method_options=apigw.MethodOptions(
                authorization_type=apigw.AuthorizationType.COGNITO,
                authorizer=authorizer,
            ),
        )

        # Make /health public (override default Cognito protection for this method)
        health = api.root.add_resource("health")
        health.add_method(
            "GET",
            apigw.LambdaIntegration(api_lambda),
            authorization_type=apigw.AuthorizationType.NONE,
        )

        # ==========================
        # EventBridge (daily tick)
        # ==========================
        events.Rule(
            self,
            "DailyRule",
            schedule=events.Schedule.rate(Duration.days(1)),
            targets=[targets.LambdaFunction(api_lambda)],
        )

        # =======
        # Outputs
        # =======
        CfnOutput(self, "StackName", value=stack_name_ctx)
        CfnOutput(self, "TableName", value=table.table_name)

        CfnOutput(self, "ApiUrl", value=api.url)
        CfnOutput(self, "BucketName", value=site_bucket.bucket_name)

        if distribution:
            CfnOutput(self, "CloudFrontURL", value=f"https://{distribution.domain_name}")

        CfnOutput(self, "UserPoolId", value=user_pool.user_pool_id)
        CfnOutput(self, "UserPoolClientId", value=user_pool_client.user_pool_client_id)
        CfnOutput(self, "HostedUiBaseUrl", value=cognito_domain.domain_name)
