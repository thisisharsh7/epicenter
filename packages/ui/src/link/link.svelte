<!--
	Installed from @ieedan/shadcn-svelte-extras
-->

<script lang="ts" module>
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	export type LinkProps = HTMLAnchorAttributes & {
		tooltip?: string;
	};
</script>

<script lang="ts">
	import { cn } from '#/utils/utils';
	import * as Tooltip from '#/tooltip';

	let { children, class: className, tooltip, ...rest }: LinkProps = $props();
</script>

{#snippet linkContent(tooltipProps?: Record<string, unknown>)}
	<a
		{...rest}
		{...tooltipProps}
		class={cn(
			'text-primary underline-offset-4 hover:underline',
			className,
		)}
	>
		{@render children?.()}
	</a>
{/snippet}

{#if tooltip}
	<Tooltip.Provider>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					{@render linkContent(props)}
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs text-center">
				{tooltip}
			</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{:else}
	{@render linkContent()}
{/if}
