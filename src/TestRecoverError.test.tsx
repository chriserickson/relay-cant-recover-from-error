import { render, act, waitFor } from '@testing-library/react';
import React, { Suspense, useContext, useState } from 'react';
import { useLazyLoadQuery, commitLocalUpdate, useRelayEnvironment, RelayEnvironmentProvider } from 'react-relay';
import { createMockEnvironment, MockPayloadGenerator, RelayMockEnvironment } from 'relay-test-utils';
import { TestRecoverErrorQuery } from './__generated__/TestRecoverErrorQuery.graphql';
import graphql from 'babel-plugin-relay/macro';


const QueryKeyContext = React.createContext<[number, (newValue: number) => void]>([0, () => { throw new Error("not implemented") }]);

const Component = () => {
    console.log('Component render');

    const [fetchKey] = useContext(QueryKeyContext)

    let viewer: TestRecoverErrorQuery["response"]["viewer"]
    try {
        viewer = useLazyLoadQuery<TestRecoverErrorQuery>(
            graphql`
                query TestRecoverErrorQuery {
                viewer {
                    accounts {
                        edges {
                            node {
                                uuid
                            }
                        }
                    }
                }
              }
          `,
            {},
            { fetchKey }
        ).viewer;
    } catch (suspense) {
        console.log("Suspended")
        throw suspense;
    }

    console.log('Suspense resolved', JSON.stringify({ fetchKey, viewer }));

    return (
        <div>
            <div>Accounts:</div>
            {viewer?.accounts?.edges?.map((edge) => (
                // node! reflects a type error 
                // (note: backends like gqlgen don't bubbble up required fields in arrays, so things like this are very possible, 
                // but it is just as easy to have happen with a non-typed environment)
                // https://github.com/99designs/gqlgen/issues/811
                <div key={edge.node!.uuid}>
                    {edge.node!.uuid}
                </div>
            ))}
        </div>
    );
};

const ErrorFallback: React.FC<{
    message: string;
    onDismiss: () => void;
}> = ({ message, onDismiss }) => {
    const relayEnvironment = useRelayEnvironment();
    const [key, setKey] = useContext(QueryKeyContext);

    const handleRetry = () => {
        console.log("Retry called")
        commitLocalUpdate(relayEnvironment, (store) => {
            //@ts-expect-error https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/55411
            store.invalidateStore();
        });
        setKey(key + 1)
        onDismiss();
    }

    return (
        <div>
            <div>ERROR BOUNDARY</div>
            <div>{message}</div>
            <button
                onClick={handleRetry}>
                RETRY
            </button>
        </div>
    );
};


class ErrorBoundary extends React.Component {
    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    state: { error: Error | null } = { error: null };

    render() {
        const { error } = this.state;

        if (!error) {
            return this.props.children;
        }

        return (
            <ErrorFallback
                message={error?.message ?? 'NO MESSAGE'}
                onDismiss={() => this.setState({ error: null })}
            />
        );
    }
}


const Fixture = ({ environment }: { environment: RelayMockEnvironment }) => {
    const queryKeyContextValue = useState(0);

    return (
        <QueryKeyContext.Provider value={queryKeyContextValue}>
            <RelayEnvironmentProvider environment={environment}>
                <ErrorBoundary>
                    <Suspense fallback={"LOADING"}>
                        <Component />
                    </Suspense>
                </ErrorBoundary>
            </RelayEnvironmentProvider>
        </QueryKeyContext.Provider>

    )
}

describe('Unexpected relay behavior', () => {
    it('returns stale data when incrementing the fetch key and invalidating the store', async () => {
        const environment = createMockEnvironment();

        const { getByText, findByText } = render(<Fixture environment={environment} />);

        act(() => {
            console.log("Resolving operation with nulls")
            environment.mock.resolveMostRecentOperation((operation) =>
                MockPayloadGenerator.generate(operation, {
                    AccountConnection: () => ({
                        // An account fails to load
                        edges: [{ node: { uuid: 1 } }, { node: null }],
                    }),
                }),
            );
        });

        expect(await findByText('ERROR BOUNDARY')).toBeVisible();

        await act(async () => {
            getByText('RETRY').click();

            await waitFor(() => environment.mock.getAllOperations().length > 0);

            console.log("Resolving operation without nulls")
            environment.mock.resolveMostRecentOperation((operation) =>
                MockPayloadGenerator.generate(operation, {
                    AccountConnection: () => ({
                        edges: [{ node: { uuid: 1 } }, { node: { uuid: 2 } }],
                    }),
                }),
            );
        });

        expect(await findByText('Accounts:')).toBeTruthy();
    });
});

