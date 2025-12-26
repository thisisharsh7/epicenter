import { createClient } from '@epicenter/hq';
import epicenter from '../../epicenter.config';

await using client = await createClient(epicenter);

await client.clippings.pullToMarkdown();

console.log('✓ Pulled to markdown');
