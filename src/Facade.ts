import {Action} from "redux";
import {ReplaySubject, Subject} from "rxjs";
import {
    CommandReducer,
    Commands,
    CommandsConstructor,
    CommandsInvoker,
    CommandsMethods,
    createReducerFromCommands,
    FacadeAction
} from "./commands";
import {deepFreeze} from "./deep-freeze";
import {isTyduxDevelopmentModeEnabled} from "./development";
import {
    ObservableSelection,
    selectNonNilToObervableSelection,
    selectToObservableSelection
} from "./ObservableSelection";
import {MountPoint} from "./store";
import {createProxy, functions, functionsIn} from "./utils";

let uniqueFacadeIds: { [id: string]: number } = {};

function createUniqueFacadeId(name: string) {
    if (uniqueFacadeIds[name] === undefined) {
        uniqueFacadeIds[name] = 1;
    } else {
        uniqueFacadeIds[name] += 1;
    }

    const count = uniqueFacadeIds[name];
    if (count === 1) {
        return name;
    } else {
        return `${name}(${count})`;
    }
}

export abstract class Facade<S, C extends Commands<S>> {

    readonly facadeId: string;

    private destroyed = false;

    private bufferedStateChanges = 0;

    private readonly commandContextCallstack: string[] = [];

    private readonly reduxStoreStateSubject: Subject<S> = new ReplaySubject<S>(1);

    private _state!: S;

    protected readonly commands: CommandsMethods<C>;

    constructor(readonly mountPoint: MountPoint<S, any>,
                name: String,
                commandsClass: CommandsConstructor<C>,
                initialState?: S) {

        this.facadeId = createUniqueFacadeId(name.replace(" ", "_"));
        this.enrichInstanceMethods();

        const [commandsInvoker, proxyObj] = this.createCommandsProxy(commandsClass);
        this.commands = proxyObj;

        mountPoint.addReducer(this.createReducerFromCommandsInvoker(commandsInvoker));
        delete (this.commands as any).state;

        this.setState(mountPoint.getState());
        this.reduxStoreStateSubject.next(this.state);

        if (initialState !== undefined) {
            const initialFacadeStateAction = this.facadeId + "@@INIT";

            mountPoint.addReducer((state: S, action: Action) => {
                if (action.type === initialFacadeStateAction) {
                    this.setState(initialState);
                    this.reduxStoreStateSubject.next(this.state);
                    return mountPoint.setState(state, initialState);
                }

                return state;
            });

            mountPoint.dispatch({type: initialFacadeStateAction, initialFacadeState: initialState});
        }

        mountPoint.subscribe(() => {
            const currentState = Object.assign({}, mountPoint.getState());
            this.bufferedStateChanges++;
            this.setState(currentState);

            // trigger micro task to ease reentrant code
            Promise.resolve().then(() => {
                this.bufferedStateChanges--;
                this.reduxStoreStateSubject.next(currentState);
            });
        });
    }

    get state(): Readonly<S> {
        return this._state;
    }

    setState(state: S) {
        this._state = isTyduxDevelopmentModeEnabled() ? deepFreeze(state) : state;
    }

    /**
     * Completes all observables returned by this store. Once this method gets called,
     * dispatched actions won't have an effect.
     */
    destroy(): void {
        // this.destroyed = true;
        // this.storeConnector.stateChangesSubject.complete();
        // this.processedActionsSubject.complete();
    }

    /**
     * Delegate to Store#destroy() for Angular.
     */
    ngOnDestroy(): void {
        this.destroy();
    }

    hasBufferedStateChanges() {
        return this.bufferedStateChanges > 0;
    }

    /**
     * - operates on the micro-task queue
     * - only emits values when they change (identity-based)
     */
    select<R>(selector?: (state: Readonly<S>) => R): ObservableSelection<R> {
        return selectToObservableSelection(this.reduxStoreStateSubject, selector);
    }

    /**
     * - operates on the micro-task queue
     * - only emits values when they change (identity-based)
     */
    selectNonNil<R>(selector?: (state: Readonly<S>) => R | null | undefined): ObservableSelection<R> {
        return selectNonNilToObervableSelection(this.reduxStoreStateSubject, selector);
    }

    private enrichInstanceMethods() {
        const methodNamesUntilStoreParent: string[] = [];
        let level: any = this;
        while (level instanceof Facade) {
            methodNamesUntilStoreParent.push(...functions(level));
            level = Object.getPrototypeOf(level);
        }

        for (let fnMemberName of methodNamesUntilStoreParent) {
            this.enrichInstanceMethod(fnMemberName);
        }
    }

    private enrichInstanceMethod(name: string) {
        const self = this;
        let member = (this as any)[name];
        Object.getPrototypeOf(this)[name] = function () {
            self.commandContextCallstack.push(name);
            try {
                const result = member.apply(this, arguments);
                if (result instanceof Promise) {
                    return new Promise(resolve => {
                        self.commandContextCallstack.push(name);
                        resolve(result);
                    }).then(value => {
                        self.commandContextCallstack.pop();
                        return value;
                    });
                } else {
                    return result;
                }
            } finally {
                self.commandContextCallstack.pop();
            }
        };
    }

    private createCommandsProxy(commandsClass: CommandsConstructor<C>): [CommandsInvoker<C>, C] {
        const commandsInvoker = new CommandsInvoker(commandsClass);

        const proxyObj = {} as any;
        console.log("commandsInvoker.commands", commandsInvoker.commands);
        for (let mutatorMethodName of functionsIn(commandsInvoker.commands)) {
            const self = this;
            proxyObj[mutatorMethodName] = function () {
                const storeMethodName = self.commandContextCallstack[self.commandContextCallstack.length - 1];
                const actionType = `[${self.facadeId}] ${mutatorMethodName}`;
                const args = Array.prototype.slice.call(arguments);
                const mutatorAction: FacadeAction = {type: actionType, payload: args, debugContext: storeMethodName};
                return self.mountPoint.dispatch(mutatorAction);
            };
        }

        return [commandsInvoker, proxyObj];
    }

    private createReducerFromCommandsInvoker(commandsInvoker: CommandsInvoker<C>): CommandReducer<S> {
        const mutatorReducer = createReducerFromCommands<S>(this.facadeId, commandsInvoker);

        return (state: any, action: FacadeAction) => {
            const preLocalState = createProxy(this.mountPoint.extractState(state));

            if (this.destroyed || !this.isActionForThisFacade(action)) {
                return state;
            }

            const postLocalState = mutatorReducer(preLocalState, action);
            state = this.mountPoint.setState(state, postLocalState);
            return state;
        };
    }

    private isActionForThisFacade(action: Action): boolean {
        if (typeof action.type !== "string") {
            return false;
        }

        return action.type.indexOf(`[${this.facadeId}] `) === 0;
    }

}
