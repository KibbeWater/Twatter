import mongoose, { Model, model, Schema, Types } from 'mongoose';
import { compareSync, hashSync } from 'bcryptjs';
import Session, { ISession } from './ISession';
import Post, { IPost } from './IPost';
import { GenerateStorageKey, NormalizeObject } from '../libs/utils';
import Like, { ILike } from './ILike';
import Relationship, { IRelationship } from './IRelationship';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET, S3_REGION } from '../libs/storage';
import Notification, { INotification } from './INotification';
import { TransformSafe } from '../libs/user';

export interface IUser {
	_id: Types.ObjectId;
	tag: string;
	username: string;
	password: string;
	verified: boolean;

	avatar?: string;
	banner?: string;
	bio: string;

	relationships: [Types.ObjectId];
	sessions: [Types.ObjectId];
	posts: [Types.ObjectId];
	likes: [Types.ObjectId];
	notifications: [Types.ObjectId];

	group: number;
}

interface IUserMethods {
	authorize: () => Promise<ISession>;
	post: (content: string, quote?: Types.ObjectId, images?: string[], parent?: string, mentions?: IUser[]) => Promise<IPost | null>;
	likePost: (post: Types.ObjectId, shouldLike: boolean) => Promise<ILike | null>;
	createRelationship: (target: Types.ObjectId, type: 'follow' | 'block' | 'mute') => Promise<IRelationship | null>;
	removeRelationship: (target: Types.ObjectId) => Promise<IRelationship | null>;
	logout: (token: string) => Promise<void>;
	readNotifications: () => Promise<void>;
}

interface UserModel extends Model<IUser, {}, IUserMethods> {
	getUser: (tag: string) => Promise<IUser | null>;
	getUserId: (id: string) => Promise<IUser | null>;
	register: (tag: string, username: string, password: string) => Promise<IUser | null>;
	authorize: (tag: string, password: string, ip?: string) => Promise<{ user: IUser; token: string } | null>;
	authenticate: (token: string) => Promise<IUser | null>;
	uploadAvatar: (user: Types.ObjectId, file: string) => Promise<string>;
	uploadBanner: (user: Types.ObjectId, file: string) => Promise<string>;
}

export const userSchema = new Schema<IUser, UserModel, IUserMethods>(
	{
		tag: { type: String, required: true, unique: true },
		username: { type: String, required: true, unique: true },
		password: { type: String, required: true },
		verified: { type: Boolean, default: false },

		avatar: { type: String, default: null },
		banner: { type: String, default: null },
		bio: { type: String, default: '' },

		relationships: [{ type: Types.ObjectId, ref: 'Relationship' }],
		sessions: [{ type: Types.ObjectId, ref: 'Session' }],
		posts: [{ type: Types.ObjectId, ref: 'Post' }],
		likes: [{ type: Types.ObjectId, ref: 'Like' }],
		notifications: [{ type: Types.ObjectId, ref: 'Notification' }],

		group: { type: Number, default: 0 },
	},
	{
		statics: {
			getUser: function (tag: string) {
				return populateUser(this.findOne({ tag })).exec();
			},

			getUserId: function (id: string) {
				return populateUser(this.findOne({ _id: id })).exec();
			},

			register: function (tag: string, username: string, password: string) {
				const saltRounds = parseInt(process.env.SALT_ROUNDS || '') || 10;
				const hash = hashSync(password, saltRounds);

				return this.create({
					tag,
					username,
					password: hash,
				});
			},

			authorize: async function (tag: string, password: string, ip?: string) {
				// Find the user by tag (case insensitive)
				const usr = (await this.findOne({ tag: new RegExp(`^${tag}$`, 'i') }).exec()) as any;
				if (!usr) return null;

				const saltRounds = parseInt(process.env.SALT_ROUNDS || '') || 10;
				const hash = hashSync(password, saltRounds);

				if (!compareSync(password, hash)) return null;

				const session = await Session.createSession(usr._id, ip);
				usr.sessions.push(session._id);
				await usr.save();

				return { user: usr, token: session.token };
			},

			authenticate: async function (token: string) {
				const session = await Session.getSession(token);
				if (!session) return null;

				// Get the owner of the session
				let usr = await this.findOne({ _id: session.owner })
					.populate<{ posts: IPost[]; sessions: ISession[]; notifications: INotification[]; relationships: IRelationship[] }>([
						'posts',
						'sessions',
						'notifications',
						'relationships',
					])
					.populate<{ posts: (IPost & { user: IUser; quote: IPost & { user: IUser } })[] }>([
						{ path: 'posts', populate: { path: 'user' } },
						{ path: 'posts', populate: { path: 'quote' } },
						{ path: 'posts', populate: { path: 'quote', populate: { path: 'user' } } },
					])
					.populate<{
						notifications: (INotification & {
							targets: IUser[];
							post: (IPost & { user: IUser; comments: IPost[]; likes: ILike[] }) | null;
						})[];
					}>([
						{ path: 'notifications', populate: { path: 'targets' } },
						{ path: 'notifications', populate: { path: 'post' } },
						{ path: 'notifications', populate: { path: 'post', populate: { path: 'user' } } },
						{ path: 'notifications', populate: { path: 'post', populate: { path: 'comments' } } },
						{ path: 'notifications', populate: { path: 'post', populate: { path: 'likes' } } },
					])
					.lean()
					.exec();

				if (!usr) return null;

				return NormalizeObject<typeof usr>({
					...usr,
					// @ts-ignore
					notifications: usr.notifications
						.map((n) => {
							return {
								...n,
								targets: n.targets.map((t) => TransformSafe(t)),
								post: n.post ? { ...n.post, user: TransformSafe(n.post.user) } : null,
							};
						})
						.reverse(),
				});
			},

			uploadAvatar: async function (user: Types.ObjectId, file: string) {
				return new Promise<string>(async (resolve, reject) => {
					const buffer = Buffer.from(file.split(',')[1], 'base64');
					const contentType = file.split(';')[0].split(':')[1];
					const ext = file.split(';')[0].split('/')[1];

					const bucket = S3_BUCKET;
					const key = `avatars/${GenerateStorageKey()}.${ext}`;

					const command = new PutObjectCommand({
						Bucket: bucket,
						Key: key,
						Body: buffer,
						ContentType: contentType,
					});

					const usr = await this.findOne({ _id: user }).exec();
					if (!usr) return reject('User not found');

					s3Client.send(command, async (err, data) => {
						if (err) return reject(err);
						if (!data) return reject('No data returned');

						usr.avatar = `https://${process.env.CLOUDFRONT_DOMAIN || ''}/${key}`;
						await usr.save();

						resolve(usr.avatar);
					});
				});
			},

			uploadBanner: async function (user: Types.ObjectId, file: string) {
				return new Promise<string>(async (resolve, reject) => {
					const buffer = Buffer.from(file.split(',')[1], 'base64');
					const contentType = file.split(';')[0].split(':')[1];
					const ext = file.split(';')[0].split('/')[1];

					const bucket = S3_BUCKET;
					const key = `banners/${GenerateStorageKey()}.${ext}`;

					const command = new PutObjectCommand({
						Bucket: bucket,
						Key: key,
						Body: buffer,
						ContentType: contentType,
					});

					const usr = await this.findOne({ _id: user }).exec();
					if (!usr) return reject('User not found');

					s3Client.send(command, async (err, data) => {
						if (err) return reject(err);
						if (!data) return reject('No data returned');

						usr.banner = `https://${process.env.CLOUDFRONT_DOMAIN || ''}/${key}`;
						await usr.save();

						resolve(usr.banner);
					});
				});
			},
		},
	}
);

userSchema.methods.authorize = async function (ip?: string) {
	const session = await Session.createSession(this._id, ip);
	this.sessions.push(session._id);
	await this.save();
	return session;
};

userSchema.methods.post = async function (content: string, quote?: Types.ObjectId, images?: string[], parent?: string, mentions?: IUser[]) {
	return Post.post(this._id, content, quote, images, parent, mentions);
};

userSchema.methods.likePost = async function (post: Types.ObjectId, shouldLike: boolean) {
	return new Promise<ILike | null>(async (resolve, reject) => {
		if (shouldLike) return resolve(Like.likePost(this._id, post));
		else {
			const like = await Like.findOne({ user: this._id, post }).exec();
			if (!like) return null;

			resolve(await Like.unlikePost(like._id));
		}
	});
};

userSchema.methods.createRelationship = async function (target: Types.ObjectId, type: 'follow' | 'block' | 'mute') {
	return Relationship.createRelationship(this._id, target, type);
};

userSchema.methods.removeRelationship = async function (target: Types.ObjectId) {
	return Relationship.removeRelationship(this._id, target);
};

userSchema.methods.logout = async function (token: string) {
	return Session.removeSession(token);
};

userSchema.methods.readNotifications = async function () {
	await Notification.updateMany({ user: this._id, read: false }, { $set: { read: true } }, { multi: true }).exec();
};

function populateUser(user: mongoose.Query<any, any, {}, any>) {
	user.populate<{ posts: IPost[] }>('posts').populate<{
		posts: (IPost & { user: IUser; quote: IPost & { user: IUser }; likes: ILike[] })[];
	}>([
		{ path: 'posts', populate: { path: 'user' } },
		{ path: 'posts', populate: { path: 'quote' } },
		{ path: 'posts', populate: { path: 'quote', populate: { path: 'user' } } },
		{ path: 'posts', populate: { path: 'likes' } },
	]);
	return user;
}

// Fix recompilation error
const User = (mongoose.models.User as UserModel) || model<IUser, UserModel>('User', userSchema);

export default User;
