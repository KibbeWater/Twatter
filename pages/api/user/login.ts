import { setCookie } from 'cookies-next';
import type { NextApiRequest, NextApiResponse } from 'next';
import DB from '../../../libs/database';
import User from '../../../schemas/IUser';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
	return new Promise(async (resolve) => {
		if (req.method !== 'POST') return resolve(res.status(405).json({ success: false, error: 'Method not allowed' }));

		const { username, password } = req.body;

		if (!username || !password) return resolve(res.status(400).json({ success: false, error: 'Missing fields' }));

		DB(async () => {
			User.authorize(username, password)
				.then((info) => {
					if (!info) return resolve(res.status(500).json({ success: false, error: 'Invalid credentials' }));

					setCookie('token', info.token, { req, res });
					resolve(res.status(200).json({ success: true, user: info.user }));
				})
				.catch((err) => {
					console.error(err);
					resolve(res.status(500).json({ success: false, error: 'Internal server error' }));
				});
		});
	});
}
