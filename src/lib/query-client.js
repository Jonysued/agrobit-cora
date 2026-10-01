import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		mutations: { networkMode: 'always' },
		queries: {
			networkMode: 'always',
			refetchOnReconnect: true,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});