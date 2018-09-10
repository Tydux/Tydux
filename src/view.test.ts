import {assert} from "chai";
import {enableTyduxDevelopmentMode} from "./development";
import {resetTydux} from "./global-state";
import {Commands} from "./commands";
import {Fassade} from "./Fassade";
import {afterAllStoreEvents, collect} from "./test-utils";
import {View} from "./view";

// Store 1
class State1 {
    value1 = 10;
}

class Mutators1 extends Commands<State1> {
    mut1() {
        this.state.value1++;
    }
}

class Store1 extends Fassade<Mutators1, State1> {

    constructor() {
        super("store1", new Mutators1(), new State1());
    }

    action1() {
        this.commands.mut1();
    }
}

// Store 2
class State2 {
    value2 = 20;
}

class Mutators2 extends Commands<State2> {
    mut2() {
        this.state.value2++;
    }
}

class Store2 extends Fassade<Mutators2, State2> {

    constructor() {
        super("store2", new Mutators2(), new State2());
    }

    action2() {
        this.commands.mut2();
    }
}

describe("View", function () {

    beforeEach(function () {
        enableTyduxDevelopmentMode();
    });

    afterEach(() => resetTydux());

    it("StateObserver starts with the current values", async function () {
        const store1 = new Store1();
        const store2 = new Store2();

        store1.action1();
        await afterAllStoreEvents(store1);

        store2.action2();
        await afterAllStoreEvents(store2);

        const view = new View({
            store1,
            child1: {
                child2: {
                    store1
                }
            }
        });

        view.select(s => ({
            v1: s.store1.value1,
            v2: s.child1.child2.store1.value1
        }));

        let collected = collect(view.select().unbounded());
        collected.assert(
            {store1: {value1: 11}, child1: {child2: {store1: {value1: 11}}}}
        );
    });

    it("StateObserver emits changes", async function () {
        const store1 = new Store1();
        const store2 = new Store2();

        store1.action1();
        await afterAllStoreEvents(store1);

        store2.action2();
        await afterAllStoreEvents(store2);

        const view = new View({
            child1: {
                child2: {
                    store1,
                    store2
                }
            }
        });

        let collected = collect(view.select().unbounded());

        store1.action1();
        store1.action1();
        store2.action2();

        await afterAllStoreEvents(store1);
        await afterAllStoreEvents(store2);

        collected.assert(
            {child1: {child2: {store1: {value1: 11}, store2: {value2: 21}}}},
            {child1: {child2: {store1: {value1: 12}, store2: {value2: 21}}}},
            {child1: {child2: {store1: {value1: 13}, store2: {value2: 21}}}},
            {child1: {child2: {store1: {value1: 13}, store2: {value2: 22}}}},
        );
    });

    it("StateObserver always freezes the state", async function () {
        const store1 = new Store1();
        store1.action1();
        await afterAllStoreEvents(store1);

        const view = new View({
            child1: {
                child2: {
                    store1
                }
            }
        });

        let called = false;
        view.select().unbounded().subscribe(s => {
            console.log(1);
            assert.throws(() => {
                (s.child1 as any)["a"] = "a";
            });
            assert.throws(() => {
                s.child1.child2.store1.value1 = 10;
            });
            called = true;
        });
        assert.isTrue(called);
    });

    it("StateObserver#select() maps the event stream", async function () {
        const store1 = new Store1();
        const store2 = new Store2();

        const view = new View({store1, store2});

        const values: any[] = [];
        view
            .select(s => {
                return {
                    v1: s.store1.value1,
                    v2: s.store2.value2
                };
            })
            .unbounded()
            .subscribe(v => {
                values.push([v.v1, v.v2]);
            });

        store1.action1();
        store2.action2();

        await afterAllStoreEvents(store1);
        await afterAllStoreEvents(store2);

        assert.deepEqual(values, [
           [10, 20],
           [11, 20],
           [11, 21],
        ]);
    });

    it("StateObserver#select() filters the event stream", async function () {
        const store1 = new Store1();
        const store2 = new Store2();

        const view = new View({store1, store2});

        const values: any[] = [];
        view
            .select(s => {
                return {
                    v1: s.store1.value1
                };
            })
            .unbounded()
            .subscribe(v => {
                values.push([v.v1]);
            });

        store2.action2();

        await afterAllStoreEvents(store1);
        await afterAllStoreEvents(store2);

        assert.deepEqual(values, [
           [10],
        ]);
    });

    it("StateObserver#select() directly provides the structure to select from (1 observer)", function (done) {
        const store1 = new Store1();
        const store2 = new Store2();

        const view = new View({store1, store2});
        view
            .select(vs => {
                assert.equal(vs.store1.value1, 10);
                assert.equal(vs.store2.value2, 20);
                done();
            })
            .unbounded()
            .subscribe();
    });

    it("StateObserver#select() directly provides the structure to select from (2 observers)", function (done) {
        const store1 = new Store1();
        const store2 = new Store2();

        const view = new View({store1, store2});

        view
            .select(vs => {
                assert.equal(vs.store1.value1, 10);
                assert.equal(vs.store2.value2, 20);
            })
            .unbounded()
            .subscribe();

        view
            .select(vs => {
                assert.equal(vs.store1.value1, 10);
                assert.equal(vs.store2.value2, 20);
                done();
            })
            .unbounded()
            .subscribe();
    });

    it("correctly unsubscribes with 1 observer", function () {
        const store1 = new Store1();
        const store2 = new Store2();

        const view = new View({store1, store2});

        assert.equal(view.internalSubscriptionCount, 0);

        let sub1 = view
            .select(vs => {
                assert.equal(vs.store1.value1, 10);
                assert.equal(vs.store2.value2, 20);
            })
            .unbounded()
            .subscribe();

        assert.equal(view.internalSubscriptionCount, 2);
        sub1.unsubscribe();
        assert.equal(view.internalSubscriptionCount, 0);
    });

    it("correctly unsubscribes with 2 observers", function () {
        const store1 = new Store1();
        const store2 = new Store2();

        const view = new View({store1, store2});

        assert.equal(view.internalSubscriptionCount, 0);

        let sub1 = view
            .select(vs => {
                assert.equal(vs.store1.value1, 10);
                assert.equal(vs.store2.value2, 20);
            })
            .unbounded()
            .subscribe();

        let sub2 = view
            .select(vs => {
                assert.equal(vs.store1.value1, 10);
                assert.equal(vs.store2.value2, 20);
            })
            .unbounded()
            .subscribe();

        assert.equal(view.internalSubscriptionCount, 4);
        sub1.unsubscribe();
        assert.equal(view.internalSubscriptionCount, 2);
        sub2.unsubscribe();
        assert.equal(view.internalSubscriptionCount, 0);
    });

});
