import { ObjectId } from "mongodb";
import { getMongoDb } from "@src/loaders/mongoDatabase";

export interface UserDoc {
  _id?: ObjectId;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  passwordHash?: string;
  googleId?: string;
  avatarUrl?: string;
  createdAt: Date;
}

export interface GroupDoc {
  _id?: ObjectId;
  name: string;
  description?: string;
  visibility: "public" | "private";
  ownerId: ObjectId;
  members: ObjectId[];
  joinCode: string;
  createdAt: Date;
}

export interface AlbumDoc {
  _id?: ObjectId;
  name: string;
  description?: string;
  ownerType: "user" | "group";
  ownerId: ObjectId;
  coverPhotoId?: ObjectId;
  position: number;
  createdAt: Date;
}

export interface PhotoDoc {
  _id?: ObjectId;
  albumId: ObjectId;
  uploaderId: ObjectId;
  uploaderName: string;
  comment?: string;
  s3Key: string;
  url: string;
  contentType: string;
  size: number;
  position: number;
  createdAt: Date;
}

export interface InviteDoc {
  _id?: ObjectId;
  groupId: ObjectId;
  email: string;
  invitedBy: ObjectId;
  token: string;
  status: "pending" | "accepted" | "expired";
  createdAt: Date;
  acceptedAt?: Date;
}

export interface ShareTokenDoc {
  _id?: ObjectId;
  albumId: ObjectId;
  ownerId: ObjectId;
  token: string;
  name?: string;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
}

export const Users = () => getMongoDb().collection<UserDoc>("users");
export const Groups = () => getMongoDb().collection<GroupDoc>("groups");
export const Albums = () => getMongoDb().collection<AlbumDoc>("albums");
export const Photos = () => getMongoDb().collection<PhotoDoc>("photos");
export const Invites = () => getMongoDb().collection<InviteDoc>("invites");
export const ShareTokens = () =>
  getMongoDb().collection<ShareTokenDoc>("share_tokens");
