// Vue 3 component: <Barcode value="..." format="QR" :scale="6" />. Any toSVG option is an attribute.
import { defineComponent, h, computed } from 'vue';
import { toSVG } from './index.js';

export const Barcode = defineComponent({
	name: 'Barcode',
	inheritAttrs: false,
	props: { value: { type: [String, Number], required: true } },
	setup(props, { attrs }) {
		const svg = computed(() => {
			const { class: _c, style: _s, ...options } = attrs;
			return toSVG(props.value, options);
		});
		return () => h('span', { ...(attrs.class && { class: attrs.class }), ...(attrs.style && { style: attrs.style }), role: 'img', 'aria-label': String(props.value), innerHTML: svg.value });
	},
});
