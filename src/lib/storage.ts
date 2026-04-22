import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage with progress tracking.
 * @param file The file to upload.
 * @param path The path in the storage.
 * @param onProgress Callback function for progress updates (0-100).
 */
export const uploadMedia = (
  file: File, 
  path: string, 
  onProgress?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 5-minute timeout as a safety measure for very large files
    const timeout = setTimeout(() => {
      uploadTask.cancel();
      reject(new Error("Upload timed out after 5 minutes."));
    }, 5 * 60 * 1000);

    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(progress);
      },
      (error) => {
        clearTimeout(timeout);
        console.error("Upload error details:", error);
        reject(error);
      },
      async () => {
        try {
          clearTimeout(timeout);
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};
