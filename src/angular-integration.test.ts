import {assert} from "chai";
import {OnDestroyLike, toAngularComponent} from "./angular-integration";
import {enableTyduxDevelopmentMode} from "./development";
import {StateGroup, Store} from "./Store";


describe("Angular integration", function () {

    beforeEach(() => enableTyduxDevelopmentMode());

    // afterEach(() => resetTydux());

    it("completes all subscriptions when the component gets destroyed", function () {

        const state = {
            count: 0
        };

        class CounterStateGroup extends StateGroup<typeof state> {
            increment() {
                this.state.count++;
            }
        }

        const rootStateGroup = {
            counter: new CounterStateGroup(state)
        };

        const store = new Store(rootStateGroup);

        const events: any[] = [];

        class DummyComponent implements OnDestroyLike {
            ngOnDestroy() {
                events.push("ngOnDestroy");
            }
        }

        const component = new DummyComponent();

        store.bounded(toAngularComponent(component))
            .select(s => s.counter.count)
            .subscribe(a => events.push(a));

        store.mutate.counter.increment();
        store.mutate.counter.increment();
        component.ngOnDestroy();
        store.mutate.counter.increment();

        assert.deepEqual(events, [
            0,
            1,
            2,
            "ngOnDestroy"
        ]);

    });

});
