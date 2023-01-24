import axios from 'axios';
import Image from 'next/image';
import { useContext, useEffect, useRef, useState } from 'react';

import { faXmark, faImage } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { SendPost } from '../../libs/post';
import { UserContext } from '../Handlers/UserHandler';
import TextareaAutosize from '../TextAutosize';
import { MultipartUploader } from '../../libs/storage';

type Props = {
	placeholder?: string;
	btnText?: string;
	onPost?: () => void;
	children?: React.ReactNode;
	inline?: boolean;
	avatarSize?: number;
	padding?: number;
	parent?: string;
};

export default function PostTwaat({ onPost, placeholder, btnText, children, inline, avatarSize = 48, padding, parent }: Props) {
	const [text, setText] = useState('');

	const [images, setImages] = useState<string[]>([]);
	const [videos, setVideos] = useState<string[]>([]);

	const [loadingPost, setLoadingPost] = useState(false);

	const postAlbumRef = useRef<HTMLDivElement>(null);

	const { user } = useContext(UserContext);

	useEffect(() => {
		if (images.length > 0 && videos.length > 0) {
			setImages([]);
			setVideos([]);
		}
	}, [images, videos]);

	if (!user) return null;

	const btnPostClick = async () => {
		if (loadingPost) return;
		setLoadingPost(true);
		SendPost(text, undefined, await syncMedia(), parent).then((res) => {
			setText('');
			setImages([]);
			if (onPost) onPost();
			setLoadingPost(false);
		});
	};

	const uploadMedia = () => {
		// We wanna get a max of 4 images (2MB each) OR 1 video (no limit)
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.accept = 'image/*,video/*';
		input.onchange = () => {
			const files = input.files;
			if (!files) return alert('No files selected');

			// The user can only select 4 images and no videos OR 1 video and no images
			if (files.length > 4) return alert('You can only select a maximum of 4 images');
			if (files.length > 1) {
				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					if (file.type.startsWith('video')) return alert('You can only select 1 video');
				}
			}

			// Check if the user selected images that were too big
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const reader = new FileReader();

				reader.onload = (e) => {
					const data = e.target?.result;
					const isVideo = file.type.startsWith('video');

					console.log(file.type);
					console.log(data);

					if (!isVideo) {
						if (!data || typeof data !== 'string') return console.error('Invalid data');
						if (data.length > 2 * 1024 * 1024) return alert('Image is too big, max size is 2MB');
					} else {
						if (!data || typeof data !== 'string') return console.error('Invalid data');
					}

					//setImages((prev) => (prev.length < 4 ? [...prev, data] : prev));
					if (!isVideo) setImages((prev) => (prev.length < 4 ? [...prev, data] : prev));
					else setVideos((prev) => (prev.length < 1 ? [...prev, data] : prev));
				};
				reader.readAsDataURL(file);
			}
		};
		input.click();
	};

	const syncMedia = () => {
		const syncImage = (image: string): Promise<{ success: boolean; url: string; error?: string }> => {
			return new Promise((resolve, reject) => {
				axios
					.post<{ success: boolean; url: string; error?: string }>('/api/post/upload', { image })
					.then((res) => resolve(res.data));
			});
		};

		// Video uploads are a bit different, we need to upload the raw video data to the server with content-type: video/mp4.
		const syncVideo = (video: string): Promise<{ videoId: string; identifier: string }> => {
			return new Promise((resolve, reject) => {
				if (!video.startsWith('data:')) return;

				const ext = video.split(';')[0].split('/')[1];
				if (ext !== 'mp4') return alert('Video must be an mp4');

				const uploader = new MultipartUploader(video);
				uploader.upload().then((videoId) => {
					console.log('Uploaded video with id', videoId);
				});
			});
		};

		return new Promise<string[]>((resolve, reject) => {
			if (images.length === 0 && videos.length === 0) return resolve([]);
			Promise.all([...images.map(async (image) => syncImage(image)), ...videos.map(async (video) => syncVideo(video))])
				.then((res) => {
					console.log(res);
					// @ts-ignore
					resolve(res.map((r) => (r.videoId ? null : r.url)));
				})
				.catch((err) => {
					console.error(err);
					reject(err);
				});
		});
	};

	return (
		<div className='flex flex-col w-full'>
			<div className='flex w-full bg-white dark:bg-black relative z-10' style={{ paddingInline: padding }}>
				<div className='relative' style={{ width: avatarSize, height: avatarSize }}>
					<div className='absolute' style={{ width: avatarSize, height: avatarSize }}>
						<Image
							className='object-cover rounded-full w-full h-full'
							src={user.avatar || '/default_avatar.png'}
							alt={`${user.username}'s Avatar`}
							sizes='100vw'
							fill
							priority
						/>
					</div>
				</div>

				<div className='flex flex-col pl-5 pr-1 w-full' style={{ marginTop: inline ? 12 : 0 }}>
					<TextareaAutosize
						minRows={1}
						placeholder={placeholder || "What's happening?"}
						className={
							!inline
								? 'w-full outline-none border-0 resize-none text-xl bg-transparent text-black dark:text-white'
								: 'text-black dark:text-white bg-transparent border-0 text-lg leading-6 columns-4 resize-none w-full p-0 m-0 outline-none'
						}
						value={text}
						maxLength={2000}
						onChange={(e) => setText(e.target.value)}
					/>
					<div
						className={'grid grid-cols-2 gap-1 mt-3 b-1'}
						ref={postAlbumRef}
						style={{
							height:
								images.length !== 0 || videos.length !== 0
									? `${(postAlbumRef.current || { clientWidth: 1 }).clientWidth * 0.6}px`
									: '1px',
							opacity: images.length !== 0 || videos.length !== 0 ? 1 : 0,
						}}
					>
						{images.map((img, i) => (
							<div
								key={`post-image-${i}`}
								className={
									'w-full h-full relative' +
									(images.length == 1 || (images.length == 3 && i == 0) ? ' row-span-2' : '') +
									(images.length == 1 ? ' col-span-2' : '')
								}
							>
								<Image
									src={img}
									className={'object-cover w-full h-full rounded-xl'}
									alt={`Album image ${i}`}
									sizes={'100vw'}
									fill
								/>
								<div
									className={
										'absolute top-2 left-2 z-10 w-7 h-7 flex justify-center items-center rounded-full' +
										' backdrop-blur-md bg-black/60 hover:bg-black/40 cursor-pointer'
									}
									onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
								>
									<FontAwesomeIcon icon={faXmark} />
								</div>
							</div>
						))}
						{videos.map((video, i) => (
							<div
								key={`post-video-${i}`}
								className={
									'w-full h-full relative' +
									(videos.length == 1 || (videos.length == 3 && i == 0) ? ' row-span-2' : '') +
									(videos.length == 1 ? ' col-span-2' : '')
								}
							>
								<video
									src={video}
									controls
									className={'object-cover w-full h-full rounded-xl'}
									/* alt={`Album video ${i}`} */
									/* sizes={'100vw'} */
									/* fill */
								/>
								<div
									className={
										'absolute top-2 left-2 z-10 w-7 h-7 flex justify-center items-center rounded-full' +
										' backdrop-blur-md bg-black/60 hover:bg-black/40 cursor-pointer'
									}
									onClick={() => setVideos((prev) => prev.filter((_, j) => j !== i))}
								>
									<FontAwesomeIcon icon={faXmark} />
								</div>
							</div>
						))}
					</div>
					{!inline ? <div className='h-px w-full opacity-50 bg-gray-500' /> : null}
					<div className='flex justify-between items-center mt-2 h-min'>
						<div
							className='flex items-center justify-center w-10 h-10 rounded-full transition-colors text-red-500 bg-accent-primary-500/0 hover:bg-accent-primary-500/20 hover:cursor-pointer'
							onClick={() => uploadMedia()}
						>
							<FontAwesomeIcon icon={faImage} size={'lg'} />
						</div>
						<div>
							<button
								className={
									'py-[6px] px-4 rounded-full border-0 bg-accent-primary-500 text-white cursor-pointer text-md font-bold transition-colors ' +
									'disabled:bg-red-700 disabled:text-gray-200 disabled:cursor-default transition-all'
								}
								onClick={btnPostClick}
								disabled={(!text && images.length === 0) || loadingPost}
							>
								{btnText || 'Twaat'}
							</button>
						</div>
					</div>
				</div>
			</div>
			{children}
		</div>
	);
}
