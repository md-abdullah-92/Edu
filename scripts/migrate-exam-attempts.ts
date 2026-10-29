import mongoose from "mongoose";
import { connectDB, courseCoverBucket } from "../lib/db";
import { Attempt, Course, Result } from "../lib/models";

async function dropLegacyIndex(collection: typeof Result.collection) {
  const indexes = await collection.indexes();
  const legacyIndex = indexes.find((index) => index.unique && Object.keys(index.key).join(",") === "exam,student");
  if (legacyIndex?.name) await collection.dropIndex(legacyIndex.name);
}

async function main() {
  await connectDB();
  const bucket = courseCoverBucket();
  await dropLegacyIndex(Result.collection);
  await dropLegacyIndex(Attempt.collection);

  const oldResults = await Result.find({ attemptNumber: { $exists: false } }).select("+answers correctCount").lean();
  for (const result of oldResults) {
    const answers = result.answers as number[];
    await Result.collection.updateOne({ _id: result._id as mongoose.Types.ObjectId }, {
      $set: {
        attemptNumber: 1,
        wrongCount: Math.max(0, answers.length - result.correctCount),
        unansweredCount: 0
      }
    });
  }

  await Attempt.updateMany({ attemptNumber: { $exists: false } }, { $set: { attemptNumber: 1 } });
  await Result.collection.createIndex({ exam: 1, student: 1, attemptNumber: 1 }, { unique: true });
  await Attempt.collection.createIndex({ exam: 1, student: 1, attemptNumber: 1 }, { unique: true });

  const legacyCourses = await Course.find({ coverImage: /^data:image\/(jpeg|png|webp);base64,/ }).select("coverImage");
  let migratedCovers = 0;
  for (const course of legacyCourses) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(course.coverImage ?? "");
    if (!match) continue;
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > 5_000_000) throw new Error(`Invalid legacy cover image for course ${course.id}`);
    const upload = bucket.openUploadStream(`${course.id}-legacy-cover`, { contentType: match[1], metadata: { courseId: course.id } });
    await new Promise<void>((resolve, reject) => {
      upload.once("finish", resolve);
      upload.once("error", reject);
      upload.end(bytes);
    });
    course.coverImageFileId = upload.id;
    course.coverImageContentType = match[1] as "image/jpeg" | "image/png" | "image/webp";
    course.coverImage = `/api/courses/${course.id}/cover?v=${Date.now()}`;
    try {
      await course.save();
      migratedCovers += 1;
    } catch (error) {
      await bucket.delete(upload.id).catch(() => undefined);
      throw error;
    }
  }

  console.log(`Migrated ${oldResults.length} previous exam results, ${migratedCovers} course covers and indexed attempt history.`);
  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  await mongoose.disconnect();
});