import {assert} from "chai";
import {Action, createStore, Store as ReduxStore} from "redux";
import {distinctUntilChanged, map} from "rxjs/operators";
import {Commands} from "./commands";
import {Fassade} from "./Fassade";
import {createTyduxStoreBridge} from "./store";
import {collect, createAsyncPromise, createTestMount, untilNoBufferedStateChanges} from "./test-utils";
import {areArraysShallowEquals, isNil} from "./utils";


describe("Fassade", function () {

    it("ID must be unique", function () {
        const mount = createTestMount({});

        class TestFassade extends Fassade<any, any> {
            createCommands() {
                return new Commands();
            }
        }

        const tf1 = new TestFassade(mount);
        const tf2 = new TestFassade(mount);
        assert.notEqual(tf1.fassadeId, tf2.fassadeId);
    });

    it("select()", async function () {
        class TestCommands extends Commands<{ n1: number }> {
            inc() {
                this.state.n1++;
            }
        }

        class TestFassade extends Fassade<{ n1: number }, TestCommands> {
            createCommands() {
                return new TestCommands();
            }

            actionInc() {
                this.commands.inc();
            }
        }

        const mount = createTestMount({n1: 0});
        const fassade = new TestFassade(mount);

        const values: any[] = [];
        fassade.select((currentState) => {
            values.push([currentState, fassade.getState]);
        }).unbounded().subscribe();

        fassade.actionInc();
        fassade.actionInc();

        await untilNoBufferedStateChanges(fassade);

        assert.deepEqual(values, [
            [{n1: 0}, {n1: 0}],
            [{n1: 1}, {n1: 1}],
            [{n1: 2}, {n1: 2}],
        ]);
    });

    it("select(with selector)", async function () {
        class TestCommands extends Commands<{ n1: number }> {
            inc() {
                this.state.n1++;
            }
        }

        class TestFassade extends Fassade<{ n1: number }, TestCommands> {
            createCommands() {
                return new TestCommands();
            }

            actionInc() {
                this.commands.inc();
            }
        }

        const fassade = new TestFassade(createTestMount({n1: 0}));
        let collected = collect(fassade.select(s => s.n1).unbounded());
        fassade.actionInc();
        fassade.actionInc();

        await untilNoBufferedStateChanges(fassade);
        collected.assert(0, 1, 2);
    });

    it("selectNonNil(with selector)", async function () {
        interface TestState {
            n1?: number;
        }

        class TestCommands extends Commands<TestState> {
            inc() {
                this.state.n1 = !isNil(this.state.n1) ? this.state.n1 + 1 : 1;
            }

            clear() {
                this.state.n1 = undefined;
            }
        }

        class TestFassade extends Fassade<TestState, TestCommands> {
            createCommands() {
                return new TestCommands();
            }

            actionInc() {
                this.commands.inc();
            }

            actionClear() {
                this.commands.clear();
            }
        }

        const mount = createTestMount<TestState>({n1: undefined});
        const fassade = new TestFassade(mount);
        let collected = collect(fassade.selectNonNil(s => s.n1).unbounded());
        fassade.actionInc(); // 1
        fassade.actionClear();
        fassade.actionInc(); // 1
        fassade.actionInc(); // 2
        fassade.actionClear();
        fassade.actionInc(); // 1

        await untilNoBufferedStateChanges(fassade);
        collected.assert(1, 1, 2, 1);
    });

    it("select(with selector return an Arrays) only emits values when the content of the array changes", async function () {
        class TestCommands extends Commands<{ a: number; b: number; c: number }> {
            incAB() {
                this.state.a++;
                this.state.b++;
            }

            incC() {
                this.state.c++;
            }
        }

        class TestFassade extends Fassade<{ a: number; b: number; c: number }, TestCommands> {
            createCommands() {
                return new TestCommands();
            }

            actionIncAB() {
                this.commands.incAB();
            }

            actionIncC() {
                this.commands.incC();
            }
        }

        const fassade = new TestFassade(createTestMount({a: 0, b: 10, c: 100}));
        let collected = collect(fassade.select(s => [s.a, s.b]).unbounded());
        fassade.actionIncAB();
        fassade.actionIncC();
        fassade.actionIncAB();
        fassade.actionIncC();

        await untilNoBufferedStateChanges(fassade);
        collected.assert([0, 10], [1, 11], [2, 12]);
    });

    it("select(with selector return an object) only emits values when the content of the object changes", async function () {
        class TestCommands extends Commands<{ a: number; b: number; c: number }> {
            incAB() {
                this.state.a++;
                this.state.b++;
            }

            incC() {
                this.state.c++;
            }
        }

        class TestFassade extends Fassade<{ a: number; b: number; c: number }, TestCommands> {
            createCommands() {
                return new TestCommands();
            }

            actionIncAB() {
                this.commands.incAB();
            }

            actionIncC() {
                this.commands.incC();
            }
        }

        const fassade = new TestFassade(createTestMount({a: 0, b: 10, c: 100}));
        let collected = collect(fassade.select(s => {
            return {
                a: s.a,
                b: s.b
            };
        }).unbounded());
        fassade.actionIncAB();
        fassade.actionIncC(); // should not trigger select()
        fassade.actionIncAB();
        fassade.actionIncC(); // should not trigger select()

        await untilNoBufferedStateChanges(fassade);
        collected.assert(
            {a: 0, b: 10},
            {a: 1, b: 11},
            {a: 2, b: 12},
        );
    });

    it("select() only triggers when the selected value deeply changed", function () {
        class TestCommands extends Commands<{ root: { child: { val1: number } } }> {
            dummy() {
            }
        }

        class TestFassade extends Fassade<{ root: { child: { val1: number } } }, TestCommands> {
            createCommands() {
                return new TestCommands();
            }

            action() {
                this.commands.dummy();
            }
        }

        const state = {root: {child: {val1: 1}}};
        const store = new TestFassade(createTestMount(state));
        let collected = collect(store.select(s => s.root).unbounded());
        store.action(); // should not trigger select()
        store.action(); // should not trigger select()
        store.action(); // should not trigger select()

        collected.assert(
            state.root
        );
    });

    it("select() gets called on every `.command...` method invocation", async function () {
        class TestState {
            count = 0;
        }

        class TestCommands extends Commands<TestState> {
            increment() {
                this.state.count++;
            }

            decrement() {
                this.state.count--;
            }
        }

        class TestFassade extends Fassade<TestState, TestCommands> {
            createCommands() {
                return new TestCommands();
            }

            action() {
                this.commands.increment();
                this.commands.increment();
                this.commands.decrement();
            }
        }

        const fassade = new TestFassade(createTestMount(new TestState()));
        let collected = collect(fassade.select(s => s.count).unbounded());
        fassade.action();

        await untilNoBufferedStateChanges(fassade);
        collected.assert(0, 1, 2, 1);
    });

    it("keeps state between action invocations", async function () {
        class TestState {
            list: number[] = [];
            value?: number;
        }

        class TestCommands extends Commands<TestState> {
            setList(list: number[]) {
                this.state.list = list;
            }

            setValue(value: number) {
                this.state.value = value;
            }
        }

        class TestFasade extends Fassade<TestState, TestCommands> {
            createCommands() {
                return new TestCommands();
            }

            setList() {
                this.commands.setList([1, 2, 3]);
            }

            setValue() {
                this.commands.setValue(99);
            }
        }


        const fassade = new TestFasade(createTestMount(new TestState()));
        fassade.setList();
        fassade.setValue();

        await untilNoBufferedStateChanges(fassade);
        assert.deepEqual(fassade.getState.list, [1, 2, 3]);
        assert.equal(fassade.getState.value, 99);
    });

    it("keeps state between async invocations", async function () {
        class TestState {
            list: number[] = [];
            value?: number;
        }

        class TestCommands extends Commands<TestState> {
            setList(list: number[]) {
                this.state.list = list;
            }

            setValue(value: number) {
                assert.deepEqual(this.state.list, [1, 2, 3]);
                this.state.value = value;
            }
        }

        class TestFassade extends Fassade<TestState, TestCommands> {
            createCommands() {
                return new TestCommands();
            }

            async setList() {
                const list = await createAsyncPromise([1, 2, 3]);
                this.commands.setList(list);
            }

            async setValue() {
                const value = await createAsyncPromise(99);
                this.commands.setValue(value);
            }
        }

        const store = new TestFassade(createTestMount(new TestState()));
        await store.setList();
        await store.setValue();

        assert.deepEqual(store.getState.list, [1, 2, 3]);
        assert.equal(store.getState.value, 99);
    });

    it("emits CommandsEvents in the correct order when re-entrant code exists", function (done) {
        const initialState = {
            list1: [] as number[],
            list2: [] as number[]
        };

        function plainReducer(state = initialState) {
            return state;
        }

        const tyduxBridge = createTyduxStoreBridge();
        const reduxStore: ReduxStore<typeof initialState, Action> = createStore(tyduxBridge.wrapReducer(plainReducer));
        const mount = tyduxBridge.createMountPoint(reduxStore, s => s, (_, s) => ({...s}));

        class TestCommands extends Commands<{ list1: number[], list2: number[] }> {
            setList1(list: number[]) {
                this.state.list1 = list;
            }

            setList2(list: number[]) {
                this.state.list2 = list;
            }
        }

        class TestFassade extends Fassade<{ list1: number[], list2: number[] }, TestCommands> {

            private counter = 0;

            constructor() {
                super(mount);

                this.select()
                    .unbounded()
                    .pipe(
                        map(() => this.getState.list1),

                        // only trigger when list1 was changed
                        distinctUntilChanged((val1, val2) => areArraysShallowEquals(val1, val2))
                    )
                    .subscribe(list1 => {
                        this.commands.setList2([...this.getState.list2, list1.length]);
                    });
            }

            getName() {
                return "";
            }

            createCommands() {
                return new TestCommands();
            }

            action() {
                this.commands.setList1([
                    this.counter++,
                ]);
            }
        }

        const fassade = new TestFassade();
        fassade.action();

        let states: any[] = [];
        fassade.select().unbounded()
            .subscribe(state => {
                states.push(state);
            });

        setTimeout(() => {
            assert.deepEqual(states, [
                {list1: [], list2: []},
                {list1: [], list2: [0]},
                {list1: [0], list2: [0]},
                {list1: [0], list2: [0, 1]},
            ]);
            done();
        }, 0);
    });
    /*

    it("destroy() completes processedActions$ observable", function (done) {
        class TestFassade extends Fassade<Commands<any>, { n1: number }> {
        }

        const store = new TestFassade("", new Commands(), {n1: 0});
        store.processedActions$.subscribe(NOOP, NOOP, done);
        store.destroy();
    });

    it("destroy() completes observable returned by select()", function (done) {
        class TestFassade extends Fassade<Commands<any>, { n1: number }> {
        }

        const store = new TestFassade("", new Commands(), {n1: 0});
        store.select().unbounded().subscribe(NOOP, NOOP, done);
        store.destroy();
    });

    it("destroy() completes observable returned by selectNonNil()", function (done) {
        class TestFassade extends Fassade<Commands<any>, { n1: number }> {
        }

        const store = new TestFassade("", new Commands(), {n1: 0});
        store.selectNonNil(s => s).unbounded().subscribe(NOOP, NOOP, done);
        store.destroy();
    });
*/

});