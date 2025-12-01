import { createEpicenterClient } from '@epicenter/hq';
import epicenter from '../../epicenter.config';

await using client = await createEpicenterClient(epicenter);

await client.clippings.addGitHubRepo({
	url: 'https://github.com/coder/ghostty-web',
	readme_quality: 'great',
	impact: 'decent',
	title: null,
	description: null,
	hacker_news_url: 'https://news.ycombinator.com/item?id=46110842',
});

console.log('✓ ghostty-web repo added');
