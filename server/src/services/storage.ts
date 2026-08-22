import path from 'path';
import fs from 'fs';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env';
import { prisma } from '../db/prisma';

export class StorageService {
  private s3Client: S3Client | null = null;

  constructor() {
    if (config.storage.provider !== 'local' && config.storage.accessKeyId) {
      this.s3Client = new S3Client({
        region: config.storage.region,
        credentials: {
          accessKeyId: config.storage.accessKeyId,
          secretAccessKey: config.storage.secretAccessKey,
        },
        endpoint: config.storage.endpoint,
        forcePathStyle: !!config.storage.endpoint,
      });
    }

    // Ensure local directory structure exists
    if (!fs.existsSync(config.storage.localUploadDir)) {
      fs.mkdirSync(config.storage.localUploadDir, { recursive: true });
    }
  }

  async getPresignedUploadUrl(
    roomId: string,
    filename: string,
    contentType: string,
    baseUrl: string
  ): Promise<{ uploadUrl: string; storageKey: string; publicUrl: string }> {
    const timestamp = Date.now();
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `rooms/${roomId}/${timestamp}_${cleanFilename}`;

    if (this.s3Client && config.storage.bucket) {
      const command = new PutObjectCommand({
        Bucket: config.storage.bucket,
        Key: storageKey,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });

      let publicUrl: string;
      if (config.storage.publicUrl) {
        publicUrl = `${config.storage.publicUrl.replace(/\/$/, '')}/${storageKey}`;
      } else if (config.storage.endpoint) {
        publicUrl = `${config.storage.endpoint.replace(/\/$/, '')}/${config.storage.bucket}/${storageKey}`;
      } else {
        publicUrl = `https://${config.storage.bucket}.s3.${config.storage.region}.amazonaws.com/${storageKey}`;
      }

      return { uploadUrl, storageKey, publicUrl };
    }

    // Local dev mode fallback
    const roomUploadDir = path.join(config.storage.localUploadDir, 'rooms', roomId);
    if (!fs.existsSync(roomUploadDir)) {
      fs.mkdirSync(roomUploadDir, { recursive: true });
    }

    const uploadUrl = `${baseUrl}/api/storage/local-upload?key=${encodeURIComponent(storageKey)}`;
    const publicUrl = `${baseUrl}/uploads/${storageKey}`;

    return { uploadUrl, storageKey, publicUrl };
  }

  async deleteRoomAudioFiles(roomId: string, specificKeys: string[] = []): Promise<void> {
    console.log(`[StorageService] 🗑️ Purging ephemeral audio files for room: ${roomId}`);

    if (this.s3Client && config.storage.bucket) {
      try {
        const prefix = `rooms/${roomId}/`;
        const listCommand = new ListObjectsV2Command({
          Bucket: config.storage.bucket,
          Prefix: prefix,
        });

        const listedObjects = await this.s3Client.send(listCommand);

        if (listedObjects.Contents && listedObjects.Contents.length > 0) {
          const deleteParams = {
            Bucket: config.storage.bucket,
            Delete: {
              Objects: listedObjects.Contents.map((obj) => ({ Key: obj.Key })),
            },
          };

          await this.s3Client.send(new DeleteObjectsCommand(deleteParams));
          console.log(`[StorageService] Deleted ${listedObjects.Contents.length} objects from S3 for room ${roomId}`);
        }
      } catch (err) {
        console.error(`[StorageService] Error deleting room files from S3:`, err);
      }
      return;
    }

    // Local cleanup
    try {
      const roomUploadDir = path.join(config.storage.localUploadDir, 'rooms', roomId);
      if (fs.existsSync(roomUploadDir)) {
        fs.rmSync(roomUploadDir, { recursive: true, force: true });
        console.log(`[StorageService] Deleted local storage folder: ${roomUploadDir}`);
      }
    } catch (err) {
      console.error(`[StorageService] Error deleting local room folder:`, err);
    }
  }

  /**
   * Automated janitor: Cleans up any orphaned directories and older ended room data.
   */
  async runOrphanedDataCleanupSweep(): Promise<void> {
    try {
      const roomsDir = path.join(config.storage.localUploadDir, 'rooms');
      if (!fs.existsSync(roomsDir)) return;

      const entries = fs.readdirSync(roomsDir);
      for (const roomId of entries) {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room || room.status === 'ended') {
          const folderPath = path.join(roomsDir, roomId);
          fs.rmSync(folderPath, { recursive: true, force: true });
          console.log(`[StorageJanitor] Purged orphaned audio folder for ended room: ${roomId}`);
        }
      }
    } catch (err) {
      console.warn(`[StorageJanitor] Error running cleanup sweep:`, err);
    }
  }
}

export const storageService = new StorageService();
