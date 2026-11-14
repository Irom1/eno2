<script lang="ts" module>
	import type { CategoryId } from './emissions';
	export type IconId = CategoryId | 'green' | 'mixed' | 'heavy' | 'sun' | 'moon' | 'arrow' | 'chevron' | 'chat' | 'calendar' | 'leaf' | 'sparkle' | 'chart' | 'receipt' | 'portrait' | 'landscape';
</script>

<script lang="ts">
	let { id, size = 18 }: { id: IconId; size?: number } = $props();

	const PATHS: Record<IconId, string> = {
		transport: 'M5 16h14M6.5 16l1.4-5.1A2 2 0 0 1 9.8 9.5h4.4a2 2 0 0 1 1.9 1.4L17.5 16M5 16v2.5M19 16v2.5M8 13.5h.01M16 13.5h.01',
		energy: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
		food: 'M5 8h14l-1.3 10.2A2 2 0 0 1 15.7 20H8.3a2 2 0 0 1-2-1.8zM9 8V6a3 3 0 0 1 6 0v2',
		shopping: 'M6 7h12l1 13H5zM9 10V6a3 3 0 0 1 6 0v4',
		housing: 'M4 11 12 4l8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5',
		green: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14zM5 19l7-7',
		mixed: 'M4 9.5c2.7-2 5.3-2 8 0s5.3 2 8 0M4 15.5c2.7-2 5.3-2 8 0s5.3 2 8 0',
		heavy: 'M7 18a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.7-1.2A4.5 4.5 0 0 1 17 18z',
		sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
		moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
		arrow: 'M6 18 18 6M8 6h10v10',
		chevron: 'm9 6 6 6-6 6',
		chat: 'M4 12a8 7 0 1 1 3.4 5.7L4 19l1.1-3.3A6.6 6.6 0 0 1 4 12z',
		calendar: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
		leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14zM5 19l7-7',
		sparkle: 'M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z',
		chart: 'M5 19V9M12 19V5M19 19v-7',
		receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4',
		portrait: 'M8.5 3h7A1.5 1.5 0 0 1 17 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5v-15A1.5 1.5 0 0 1 8.5 3z',
		landscape: 'M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5z'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={PATHS[id]} /></svg
>
