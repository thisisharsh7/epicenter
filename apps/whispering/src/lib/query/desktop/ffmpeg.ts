import { Ok } from 'wellcrafted/result';
import { WhisperingErr } from '$lib/result';
import { desktopServices } from '$lib/services';
import { defineQuery } from '../client';

export const ffmpeg = {
	checkFfmpegInstalled: defineQuery({
		queryKey: ['ffmpeg.checkInstalled'],
		queryFn: async () => {
			const { data, error } = await desktopServices.ffmpeg.checkInstalled();
			if (error) {
				return WhisperingErr({
					title: '❌ Error checking FFmpeg installation',
					serviceError: error,
				});
			}
			return Ok(data);
		},
	}),
};
