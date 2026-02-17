<script lang="ts" module>
	import * as toast from '@zag-js/toast';

	export const toaster = toast.createStore({
		placement: 'bottom',
		overlap: true,
		max: 5,
		offsets: '16px',
		gap: 12,
		removeDelay: 200
	});
</script>
