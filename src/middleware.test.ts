import {assert} from "chai";
import {enableTyduxDevelopmentMode} from "./development";
import {resetTydux} from "./global-state";
import {Middleware} from "./middleware";
import {Mutator, MutatorAction} from "./mutator";
import {ProcessedAction, Store} from "./Store";


class TestState {
    n1 = 0;
}

class TestMutator extends Mutator<TestState> {
    addToN1(val: number) {
        this.state.n1 += val;
    }
}

class TestStore extends Store<TestMutator, TestState> {
    action(val: number) {
        this.mutate.addToN1(val);
    }
}

describe("Middleware", function () {

    beforeEach(() => enableTyduxDevelopmentMode());

    afterEach(() => resetTydux());

    it("has the same state as the store", function () {
        class MyMiddleware extends Middleware<TestState, Mutator<any>, TestStore> {
            getName(): string {
                return "TestMiddleware";
            }
        }

        const store = new TestStore("TestStore", new TestMutator(), new TestState());
        const ms = store.installMiddleware(new MyMiddleware());

        assert.deepEqual(store.state, ms.state);
        store.action(1);
        assert.deepEqual(store.state, ms.state);
    });

    it("beforeActionDispatch", function (done) {
        class MyMiddleware extends Middleware<TestState, Mutator<any>, TestStore> {
            getName(): string {
                return "TestMiddleware";
            }

            beforeActionDispatch(state: TestState, action: MutatorAction): any {
                assert.deepEqual(action.arguments, [1]);
                done();
            }
        }

        const store = new TestStore("TestStore", new TestMutator(), new TestState());
        store.installMiddleware(new MyMiddleware());
        store.action(1);
    });

    it("afterActionProcessed", function (done) {
        class MyMiddleware extends Middleware<TestState, Mutator<any>, TestStore> {
            getName(): string {
                return "TestMiddleware";
            }

            afterActionProcessed(processedAction: ProcessedAction<TestState>): void {
                assert.deepEqual(processedAction.mutatorAction.arguments, [1]);
                done();
            }
        }

        const store = new TestStore("TestStore", new TestMutator(), new TestState());
        store.installMiddleware(new MyMiddleware());
        store.action(1);
    });

    it("can dispatch actions", function () {
        class MyMiddleware extends Middleware<TestState, Mutator<any>, TestStore> {

            getName(): string {
                return "TestMiddleware";
            }

            dispatch() {
                this.mutatorDispatcher({type: "addToN1", arguments: [9]});
            }
        }

        const store = new TestStore("TestStore", new TestMutator(), new TestState());
        let myMiddleware = new MyMiddleware();
        store.installMiddleware(myMiddleware);
        store.action(2);
        myMiddleware.dispatch();
        assert.deepEqual(store.state, {n1: 11});
    });

});