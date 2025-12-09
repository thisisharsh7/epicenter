import { Ok } from 'wellcrafted/result';
import { WhisperingErr } from '$lib/result';
import * as services from '$lib/services';
import { defineQuery } from './_client';

export const ffmpeg = {
	checkFfmpegInstalled: defineQuery({
		queryKey: ['ffmpeg.checkInstalled'],
		queryFn: async () => {
			const { data, error } = await services.ffmpeg.checkInstalled();
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
