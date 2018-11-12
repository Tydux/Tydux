import {assert} from "chai";
import {Commands} from "./commands";
import {enableTyduxDevelopmentMode} from "./development";
import {Facade} from "./Facade";
import {createAsyncPromise, createTestMount} from "./test-utils";


describe("Commands - sanity tests", function () {

    beforeEach(() => enableTyduxDevelopmentMode());

    it("can not access the state asynchronously", function (done) {
        class TestCommands extends Commands<{ n1: number }> {
            mut() {
                setTimeout(() => {
                    assert.throws(() => this.state, /Illegal access.*this/);
                    done();
                }, 0);
            }
        }

        class TestFacade extends Facade<{ n1: number }, TestCommands> {
            action() {
                this.commands.mut();
            }
        }

        const facade = new TestFacade(createTestMount({n1: 0}), "TestFacade", new TestCommands());
        facade.action();
    });

    it("can not modify the state asynchronously by keeping a reference to a nested state property", function (done) {
        class TestCommands extends Commands<{ root: { child: number[] } }> {
            mut() {
                const child = this.state.root.child;
                setTimeout(() => {
                    assert.throws(() => child.push(3), /not extensible/);
                    done();
                }, 0);
            }
        }

        class TestFacade extends Facade<{ root: { child: number[] } }, TestCommands> {
            action() {
                this.commands.mut();
            }
        }

        const state = {root: {child: [1, 2]}};
        const facade = new TestFacade(createTestMount(state), "TestFacade", new TestCommands());
        facade.action();
    });

    it("can not replace the state asynchronously", function (done) {
        class TestCommands extends Commands<{ n1: number }> {
            mut() {
                setTimeout(() => {
                    assert.throws(() => this.state = {n1: 99}, /Illegal access.*this/);
                    done();
                }, 0);
            }
        }

        class TestFacade extends Facade<{ n1: number }, TestCommands> {
            action() {
                this.commands.mut();
            }
        }

        const facade = new TestFacade(createTestMount({n1: 0}), "TestFacade", new TestCommands());
        facade.action();
    });

    it("can not change the state in asynchronous promise callbacks", function (done) {
        class TestCommands extends Commands<{ n1: number }> {
            mut1() {
                createAsyncPromise(1).then(val => {
                    assert.throws(() => this.state.n1 = val);
                    done();
                });
            }
        }

        class TestFacade extends Facade<{ n1: number }, TestCommands> {
            action() {
                this.commands.mut1();
            }
        }

        const facade = new TestFacade(createTestMount({n1: 0}), "TestFacade", new TestCommands());
        facade.action();
    });

    it("can not access other members asynchronously", function (done) {
        class TestCommands extends Commands<{ n1: number }> {
            mut1() {
                setTimeout(() => {
                    assert.throws(() => this.mut2(), /Illegal access.*this/);
                    done();
                }, 0);
            }

            mut2() {
                // empty
            }
        }

        class TestFacade extends Facade<{ n1: number }, TestCommands> {
            action() {
                this.commands.mut1();
            }
        }

        const facade = new TestFacade(createTestMount({n1: 0}), "TestFacade", new TestCommands());
        facade.action();
    });

    it("can not access other members in an asynchronous promise resolve", function (done) {
        class TestCommands extends Commands<{ n1: number }> {
            mut1() {
                createAsyncPromise(1)
                    .then(() => {
                        this.mut2();
                    })
                    .catch((e) => {
                        assert.match(e, /Illegal access.*this/);
                        done();
                    });
            }

            mut2() {
                // empty
            }
        }

        class TestFacade extends Facade<{ n1: number }, TestCommands> {
            action() {
                this.commands.mut1();
            }
        }

        const facade = new TestFacade(createTestMount({n1: 0}), "TestFacade", new TestCommands());
        facade.action();
    });

    it("must not return a value", function () {
        class TestCommands extends Commands<any> {
            mod1() {
                return 1;
            }
        }

        class TestFacade extends Facade<any, TestCommands> {
            action() {
                assert.throws(() => this.commands.mod1());
            }
        }

        const facade = new TestFacade(createTestMount({}), "TestFacade", new TestCommands());
        facade.action();
    });

});

