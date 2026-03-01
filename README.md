# BiNGS FastQC Pipeline — Build & Deployment Notes

> Written for future-me. This documents how the app was built, what each piece does, and how to redeploy from scratch.

---

## Architecture Overview

```
User Browser (Amplify)
    │
    ├─► POST /upload ──► Lambda ──► S3 presigned URL
    │                               │
    ├─► PUT file ───────────────────► S3 Bucket (uploads/)
    │
    ├─► POST /submit ──► Lambda ──► AWS Batch (submit job)
    │
    ├─► GET /job/{id} ─► Lambda ──► Batch.describeJobs() ──► status
    │
    └─► GET /results/{id} ► Lambda ──► S3 (results/fastqc_data.json)

AWS Batch (Fargate Spot)
    └─► Docker Container (ECR)
            ├─► Download FASTQ from S3
            ├─► Run FastQC
            ├─► Parse fastqc_data.txt → JSON
            └─► Upload JSON + HTML report to S3
```

---

## Stack

| Layer | Service | Why |
|---|---|---|
| Frontend | React + AWS Amplify | Auto-deploy from GitHub |
| API | API Gateway v2 (HTTP) | Routes to Lambda |
| Backend logic | AWS Lambda (Python 3.12) | Presign URLs, submit Batch jobs |
| Job runner | AWS Batch (Fargate Spot) | Run FastQC in Docker, ~70% cost savings |
| Container registry | Amazon ECR | Private Docker image storage |
| Storage | Amazon S3 | FASTQ uploads + JSON results |
| Logs | CloudWatch Logs | Batch job debugging |

---

## Repo Structure

```
binings-fastqc-app/
├── frontend/               # React app
│   ├── src/App.jsx         # Main UI — upload, polling, charts
│   └── .env                # REACT_APP_API_URL (local dev only)
├── backend/
│   ├── lambda/
│   │   └── handler.py      # Lambda: /upload /submit /job /results
│   └── batch/
│       ├── Dockerfile      # python:3.11-slim + fastqc via apt
│       └── run_fastqc.py   # Downloads FASTQ, runs FastQC, parses output, uploads JSON
└── docs/
    └── BUILD_NOTES.md      # This file
```

---

## AWS Resources Created

| Resource | Name |
|---|---|
| S3 Bucket | `binings-fastqc-data-kh` |
| ECR Repository | `binings-fastqc` |
| Lambda Function | `binings-fastqc-api` |
| API Gateway | `binings-fastqc-api` (HTTP, API ID: `q3k6wzlw3h`) |
| Batch Compute Environment | `binings-fastqc-compute` (Fargate Spot) |
| Batch Job Queue | `binings-fastqc-queue` |
| Batch Job Definition | `binings-fastqc-job` |
| IAM Role (Lambda) | `BiNGS-LambdaRole` |
| IAM Role (Batch) | `BiNGS-BatchJobRole` |
| Amplify App | `binings-fastqc-app` |

---

## Environment Variables

### Lambda
Set in AWS Console → Lambda → binings-fastqc-api → Configuration → Environment variables:
```
S3_BUCKET=binings-fastqc-data-kh
BATCH_JOB_QUEUE=binings-fastqc-queue
BATCH_JOB_DEFINITION=binings-fastqc-job
```

### Amplify
Set in AWS Console → Amplify → binings-fastqc-app → Environment variables:
```
REACT_APP_API_URL=https://q3k6wzlw3h.execute-api.us-east-2.amazonaws.com/prod
```

---

## How to Redeploy From Scratch (PowerShell)

### 1. Set variables
```powershell
$env:REGION = "us-east-2"
$env:ACCOUNT_ID = $(aws sts get-caller-identity --query Account --output text)
$env:ECR_REPO = "binings-fastqc"
$env:BUCKET = "binings-fastqc-data-kh"
$registry = "$env:ACCOUNT_ID.dkr.ecr.$env:REGION.amazonaws.com"
```

### 2. Build and push Docker image
```powershell
cd backend/batch
docker build -t "$env:ECR_REPO" .
aws ecr get-login-password --region "$env:REGION" | docker login --username AWS --password-stdin $registry
docker tag "$env:ECR_REPO`:latest" "$registry/$env:ECR_REPO`:latest"
docker push "$registry/$env:ECR_REPO`:latest"
```

### 3. Deploy Lambda
```powershell
cd backend/lambda
Compress-Archive -Path handler.py -DestinationPath function.zip -Force
$env:LAMBDA_ARN = $(aws iam get-role --role-name BiNGS-LambdaRole --query 'Role.Arn' --output text)

aws lambda update-function-code `
  --function-name binings-fastqc-api `
  --zip-file fileb://function.zip `
  --region "$env:REGION"
```

### 4. Update Lambda environment variables
```powershell
aws lambda update-function-configuration `
  --function-name binings-fastqc-api `
  --environment "Variables={S3_BUCKET=binings-fastqc-data-kh,BATCH_JOB_QUEUE=binings-fastqc-queue,BATCH_JOB_DEFINITION=binings-fastqc-job}" `
  --region "$env:REGION"
```

### 5. Register new Batch job definition (if Docker image changed)
```powershell
Set-Content -Path job-def.json -Value '{"image":"520152025534.dkr.ecr.us-east-2.amazonaws.com/binings-fastqc:latest","resourceRequirements":[{"type":"VCPU","value":"4"},{"type":"MEMORY","value":"8192"}],"jobRoleArn":"arn:aws:iam::520152025534:role/BiNGS-BatchJobRole","executionRoleArn":"arn:aws:iam::520152025534:role/BiNGS-BatchJobRole","networkConfiguration":{"assignPublicIp":"ENABLED"}}'

aws batch register-job-definition `
  --job-definition-name binings-fastqc-job `
  --type container `
  --container-properties file://job-def.json `
  --platform-capabilities FARGATE `
  --region "$env:REGION"
```

### 6. Deploy frontend
```powershell
cd frontend
git add .
git commit -m "update"
git push origin master
# Amplify auto-deploys on push
```

---

## Debugging

### Check Batch job status
```powershell
aws batch list-jobs --job-queue binings-fastqc-queue --job-status FAILED --region "$env:REGION"
aws batch list-jobs --job-queue binings-fastqc-queue --job-status RUNNING --region "$env:REGION"
aws batch list-jobs --job-queue binings-fastqc-queue --job-status SUCCEEDED --region "$env:REGION"
```

### Get Batch job logs
```powershell
aws logs describe-log-streams `
  --log-group-name /aws/batch/job `
  --region "$env:REGION" `
  --order-by LastEventTime `
  --descending `
  --query 'logStreams[0].logStreamName'

# Then use the stream name:
aws logs get-log-events `
  --log-group-name /aws/batch/job `
  --log-stream-name "STREAM_NAME" `
  --region "$env:REGION" `
  --query 'events[].message'
```

### Check Lambda logs
```powershell
aws logs tail /aws/lambda/binings-fastqc-api --region "$env:REGION" --since 10m
```

### Check results in S3
```powershell
aws s3 ls s3://binings-fastqc-data-kh/results/ --recursive --region "$env:REGION"
```

---

## Errors Hit During Build & Fixes

| Error | Cause | Fix |
|---|---|---|
| `fastqc: not found` | Dockerfile used wget from slow Babraham server | Switched to `python:3.11-slim` + `apt-get install fastqc` |
| `NoCredentialsError` | Batch job role missing execution role | Added `AmazonECSTaskExecutionRolePolicy` to `BiNGS-BatchJobRole` |
| `ecr:GetAuthorizationToken` denied | Batch job role missing ECR permissions | Added `AmazonEC2ContainerRegistryReadOnly` to `BiNGS-BatchJobRole` |
| `logs:CreateLogStream` denied | Batch job role missing CloudWatch permissions | Added `CloudWatchLogsFullAccess` to `BiNGS-BatchJobRole` |
| `Job Queue can not run Jobs with capability EC2` | Job definition registered as EC2, compute env is Fargate | Re-registered job definition with `--platform-capabilities FARGATE` |
| `NaN is not valid JSON` | FastQC outputs NaN floats for missing values | Added `clean_nan()` function in `run_fastqc.py` |
| `npm ci` sync error on Amplify | `package-lock.json` out of sync with `package.json` | Changed Amplify build command from `npm ci` to `npm install` |
| S3 CORS error on upload | S3 bucket missing CORS policy | Added CORS config via `aws s3api put-bucket-cors` |
| `$env:VAR` not expanding in AWS CLI | PowerShell string interpolation quirk | Used separate `$var = "..."` then passed `$var` to CLI |

---

## IAM Policies Attached

### BiNGS-LambdaRole
- `AmazonS3FullAccess`
- `AWSBatchFullAccess`
- `AWSLambdaBasicExecutionRole`

### BiNGS-BatchJobRole
- `AmazonEC2ContainerRegistryReadOnly`
- `AmazonS3FullAccess`
- `CloudWatchLogsFullAccess`
- `AmazonECSTaskExecutionRolePolicy`

---

## Key Design Decisions

**Why Fargate Spot?**
Spot instances are ~70% cheaper. FastQC jobs are short (2-5 min) and restartable, making them ideal for Spot. Min vCPUs = 0 so you pay nothing when idle.

**Why presigned S3 URLs?**
Files go directly from browser → S3, bypassing Lambda's 6MB payload limit. Lambda just generates the URL and never touches the file data.

**Why parse FastQC to JSON?**
The frontend needs structured data for charts (per-base quality, GC content etc). Raw FastQC HTML is not easy to parse in React, so the Batch job converts `fastqc_data.txt` to clean JSON.

**Why store job ID mapping in S3?**
Lambda is stateless so there's no database. Storing `batch_job_id.txt` in S3 under the job UUID is a simple key-value store that works without DynamoDB.
