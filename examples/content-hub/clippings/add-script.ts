import { createEpicenterClient } from '@epicenter/hq';
import epicenter from '../epicenter.config';

await using client = await createEpicenterClient(epicenter);

await client.clippings.addFromUrl({
	url: 'https://blog.puzzmo.com/posts/2025/07/30/six-weeks-of-claude-code/',
});
await client.clippings.addFromUrl({
	url: 'https://zhengdongwang.com/2025/07/10/superhuman-ai-in-a-normal-age.html',
});
await client.clippings.addFromUrl({
	url: 'https://jaredheyman.medium.com/on-the-new-y-combinator-3c28e548896c',
});

client.clippings.removeDuplicates();

console.log('✓ Clipping added');
