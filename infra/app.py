#!/usr/bin/env python3
import os
import aws_cdk as cdk
from stacks.scheduler_stack import SchedulerStack

app = cdk.App()

env = cdk.Environment(
    account=os.getenv("CDK_DEFAULT_ACCOUNT"),
    region=os.getenv("CDK_DEFAULT_REGION", "eu-central-1"),
)

SchedulerStack(app, "SmartHybridScheduler", env=env)

app.synth()

