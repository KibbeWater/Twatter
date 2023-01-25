import { getCookie } from 'cookies-next';
import { NextApiRequest, NextApiResponse } from 'next';
import DB from '../../../libs/database';
import { uploadImage } from '../../../libs/server/storage';
import User from '../../../schemas/IUser';

export const config = {
	api: {
		bodyParser: {
			sizeLimit: '2mb',
		},
	},
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

	const { image } = req.body;

	// target is the user to follow, block, or mute
	if (!image) return res.status(400).json({ success: false, error: 'Bad request' });

	DB(async () => {
		const token = getCookie('token', { req, res }) as string;
		if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

		const user = await User.authenticate(token);
		if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

		uploadImage(image)
			.then((url) => {
				if (!url) return res.status(500).json({ success: false, error: 'Internal server error' });
				return res.status(200).json({ success: true, url });
			})
			.catch((err) => {
				console.error(err);
				return res.status(500).json({ success: false, error: 'Internal server error' });
			});
	});
}
