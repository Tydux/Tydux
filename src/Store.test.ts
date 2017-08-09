import {Actions, enableDevelopmentMode, Store} from "./Store";


describe("Actions", function () {

    beforeEach(function () {
        enableDevelopmentMode();
    });

    it("can change the state", function () {
        class TestActions extends Actions<{ n1: number }> {
            action1() {
                console.log("this.state.n1", this.state.n1);
                this.state.n1 = 1;
            }
        }

        const store = new Store(new TestActions(), {n1: 0});
        // const calls = collect(store.select());
        store.dispatch.action1();
        // calls.assert({n1: 0}, {n1: 1});
        assert.deepEqual(store.state, {n1: 1});
    });

});
