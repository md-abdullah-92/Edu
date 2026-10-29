import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

function getMongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI environment variable");
  return uri;
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};
const cached = (globalWithMongoose.mongooseCache ??= { conn: null, promise: null });

export async function connectDB() {
  if (cached.conn) return cached.conn;
  cached.promise ??= mongoose.connect(getMongoUri(), { serverSelectionTimeoutMS: 10_000 });
  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    throw error;
  }
}

export function courseCoverBucket() {
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB is not connected");
  return new GridFSBucket(database, { bucketName: "courseCovers" });
}

export function studyMaterialBucket() {
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB is not connected");
  return new GridFSBucket(database, { bucketName: "studyMaterials" });
}
