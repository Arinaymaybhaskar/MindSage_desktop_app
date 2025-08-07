import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";
import crypto from "crypto";
import mime from "mime-types";

dotenv.config();

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

export const generateUploadUrl = async (userId, postId, fileType, type) => {
  const ext = mime.extension(fileType);
  const key = `uploads/${userId}/${type}/${postId}/${crypto.randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    ContentType: fileType,
    ACL: "private",
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 60 }); // 1 min

  return { uploadUrl: url, key };
};
