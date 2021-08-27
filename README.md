# This app includes a test that reproduces (what seems like) a bug in Relay.

Context: the backend is returning a partial response, and the frontend code has a bug where it doesn't handle the nulls. The error bubbles up to an error boundary.

We want to be able to hit "try again" on the error boundary, and have the query re-executed. (We want to fix the view bug too, but that's a separate issue.) However, we're seeing what seems like a bug in Relay.

Our "try again" handler on the error fallback does three things: 
1) calls commitLocalUpdate and calls invalidateStore() on the store.
2) Increments the query keys for EVERY query in the app.
3) Remounts the children

The behavior we are seeing is really strange:
1) The component DOES suspend, as expected. We think this is a result of invalidating the store (we verified that it does not suspend when incrementing the query key with the default store-or-network policy, which is expected as well).
2) A new request IS made. (This did not happen without incrementing query keys -- the LRU cache for the QueryResource had the old request in the cache still (due to a temporary retain maybe that is never resolved because the component never finished mounting...?))
3) When suspense resolves, the OLD data is returned (with the null values still). <--- THIS IS UNEXPECTED

Are there options that you can think of? Re-create the entire relay environment :frowning: ? This is a React Native app so you can't just click "refresh"

The test output is visible in [test_output.log](./test_output.log)