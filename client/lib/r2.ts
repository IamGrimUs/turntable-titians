import { S3Client } from '@aws-sdk/client-s3'

export const R2_REQUIRED_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'NEXT_PUBLIC_R2_PUBLIC_URL',
] as const

/** Names (never values) of required storage settings that are missing or blank. */
export function missingR2Env(): string[] {
  return R2_REQUIRED_ENV.filter((name) => !process.env[name]?.trim())
}

export function getBucket(): string {
  return process.env.R2_BUCKET_NAME!.trim()
}

export function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID!.trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    },
    // Only add checksums when an operation requires them; keeps presigned URLs simple.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}
