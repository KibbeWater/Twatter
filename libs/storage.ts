import { S3Client } from '@aws-sdk/client-s3';

const REGION = process.env.S3_REGION || 'us-east-1';

export const s3Client = new S3Client({
	region: REGION,
});