<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { customerHref } from '$lib/customerSelection';
	import ClimateWisePage from '$lib/climate/ClimateWisePage.svelte';
	import { classifyClimateSize } from '$lib/climate/layout';

	let customerId = $derived(page.url.searchParams.get('customer'));
	let dashboardHref = $derived(customerHref('/dashboard', customerId));

	const MIN_W = 320;
	const MIN_H = 420;
	const MAX_W = 1000;
	const MAX_H = 900;
	const INITIAL = { width: 440, height: 760 };

	let width = $state(INITIAL.width);
	let height = $state(INITIAL.height);
	const climateSize = $derived(classifyClimateSize(width, height));

	const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
	const maxWidth = () => Math.max(MIN_W, Math.min(MAX_W, window.innerWidth - 48));
	const maxHeight = () => Math.max(MIN_H, Math.min(MAX_H, window.innerHeight - 220));

	function setSize(nextWidth: number, nextHeight: number) {
		width = Math.round(clamp(nextWidth, MIN_W, maxWidth()));
		height = Math.round(clamp(nextHeight, MIN_H, maxHeight()));
	}

	function reset() {
		setSize(INITIAL.width, INITIAL.height);
	}

	// Pointer drag: capture the pointer so the handle keeps receiving moves even
	// when the cursor leaves the stage.
	let drag: { x: number; y: number; width: number; height: number } | null = null;

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		drag = { x: event.clientX, y: event.clientY, width, height };
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp, { once: true });
		window.addEventListener('pointercancel', onPointerUp, { once: true });
		event.preventDefault();
	}

	function onPointerMove(event: PointerEvent) {
		if (!drag) return;
		setSize(drag.width + event.clientX - drag.x, drag.height + event.clientY - drag.y);
	}

	function onPointerUp() {
		drag = null;
		window.removeEventListener('pointermove', onPointerMove);
	}

	onDestroy(() => {
		// onDestroy also runs during SSR, where there is no window to clean up.
		if (typeof window === 'undefined') return;
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerUp);
	});

	function onHandleKey(event: KeyboardEvent) {
		const step = event.shiftKey ? 64 : 16;
		let dw = 0;
		let dh = 0;
		switch (event.key) {
			case 'ArrowRight':
				dw = step;
				break;
			case 'ArrowLeft':
				dw = -step;
				break;
			case 'ArrowDown':
				dh = step;
				break;
			case 'ArrowUp':
				dh = -step;
				break;
			default:
				return;
		}
		event.preventDefault();
		setSize(width + dw, height + dh);
	}
</script>

<svelte:head><title>ClimateWise | Eno</title></svelte:head>

<div class="preview">
	<header class="toolbar">
		<div class="dims" aria-live="polite">{width} × {height}</div>
		<div class="chips">
			<span class="chip" data-field="mode">{climateSize.mode}</span>
			<span class="chip" data-field="density">{climateSize.density}</span>
			<span class="chip" data-field="layout">{climateSize.layout}</span>
			<span class="chip" data-field="ring">{climateSize.ringSize}px ring</span>
		</div>
		<button class="reset" onclick={reset}>Reset</button>
	</header>
	<p class="hint">Drag the corner to resize</p>

	<div class="stage-shell">
		<div class="stage" style="width:{width}px;height:{height}px">
			<ClimateWisePage fill {customerId} backHref={dashboardHref} />
			<!-- A two-axis resize handle: separator semantics plus pointer/keyboard handling. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="handle"
				role="separator"
				tabindex="0"
				aria-label="Resize ClimateWise preview"
				aria-valuemin={MIN_W}
				aria-valuemax={MAX_W}
				aria-valuenow={width}
				aria-valuetext="{width} by {height} pixels"
				title="Drag to resize, or use the arrow keys"
				onpointerdown={onPointerDown}
				onkeydown={onHandleKey}
			>
				<span aria-hidden="true"></span>
			</div>
		</div>
	</div>
</div>

<style>
	.preview {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 20px 16px 24px;
		background:
			radial-gradient(90% 60% at 10% 0%, rgba(91, 155, 213, 0.18) 0%, transparent 70%),
			radial-gradient(80% 60% at 100% 100%, rgba(89, 194, 111, 0.16) 0%, transparent 70%),
			#e8edf2;
		color: #10273a;
		font: 14px/1.4 Inter, system-ui, sans-serif;
	}

	.toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px 12px;
		padding: 8px 12px;
		border: 1px solid rgba(16, 39, 58, 0.12);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.78);
		box-shadow: 0 6px 20px rgba(11, 26, 42, 0.08);
	}

	.dims {
		font-weight: 750;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
	}

	.chips { display: flex; flex-wrap: wrap; gap: 6px; }

	.chip {
		padding: 2px 8px;
		border-radius: 999px;
		background: rgba(16, 39, 58, 0.07);
		color: #455a6b;
		font-size: 12px;
		font-weight: 650;
		text-transform: capitalize;
	}

	.reset {
		min-height: 30px;
		padding: 0 12px;
		border: 1px solid rgba(16, 39, 58, 0.14);
		border-radius: 999px;
		background: #fff;
		color: #10273a;
		font: inherit;
		font-weight: 650;
		cursor: pointer;
	}

	.reset:hover { background: #f3f7fa; }

	.hint { color: #5a6b79; font-size: 12.5px; }

	/* The shell can scroll if a large stage does not fit a small viewport. */
	.stage-shell {
		flex: 1;
		width: 100%;
		min-height: 0;
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		overflow: auto;
		padding: 2px;
	}

	.stage {
		position: relative;
		flex: none;
		margin: 0 auto;
		max-width: none;
		border-radius: 22px;
		box-shadow: 0 2px 4px rgba(11, 26, 42, 0.08), 0 26px 60px rgba(11, 26, 42, 0.22);
	}

	.handle {
		position: absolute;
		right: 6px;
		bottom: 6px;
		z-index: 20;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 1px solid rgba(16, 39, 58, 0.2);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.92);
		color: #455a6b;
		cursor: nwse-resize;
		touch-action: none;
	}

	.handle:hover,
	.handle:focus-visible {
		border-color: rgba(16, 39, 58, 0.4);
		outline: none;
		box-shadow: 0 0 0 3px rgba(91, 155, 213, 0.28);
	}

	/* Three diagonal grip lines, drawn with a gradient so no icon is needed. */
	.handle span {
		width: 14px;
		height: 14px;
		background-image: repeating-linear-gradient(
			-45deg,
			currentColor 0 1.5px,
			transparent 1.5px 4.5px
		);
		opacity: 0.75;
	}
</style>
