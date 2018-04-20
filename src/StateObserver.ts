import * as _ from "lodash";
import {Observable} from "rxjs/Observable";
import {Operator} from "rxjs/Operator";
import {distinctUntilChanged} from "rxjs/operators/distinctUntilChanged";
import {filter} from "rxjs/operators/filter";
import {map} from "rxjs/operators/map";
import {areArraysShallowEquals, arePlainObjectsShallowEquals} from "./utils";

export class StateObserver<S> {

    constructor(readonly stateChanges$: Observable<S>,
                readonly operator?: Operator<S, S>) {
    }

    select(): Observable<Readonly<S>>;

    select<R>(selector: (state: Readonly<S>) => R): Observable<R>;

    select<R>(selector?: (state: Readonly<S>) => R): Observable<R> {
        const stream = _.isNil(this.operator)
            ? this.stateChanges$
            : this.stateChanges$.lift(this.operator);

        return stream
            .pipe(
                map(stateChange => {
                    return !_.isNil(selector) ? selector(stateChange) : stateChange as any;
                }),
                distinctUntilChanged((oldVal, newVal) => {
                    if (_.isArray(oldVal) && _.isArray(newVal)) {
                        return areArraysShallowEquals(oldVal, newVal);
                    } else if (_.isPlainObject(newVal) && _.isPlainObject(newVal)) {
                        return arePlainObjectsShallowEquals(oldVal, newVal);
                    } else {
                        return oldVal === newVal;
                    }
                }));
    }

    selectNonNil<R>(selector: (state: Readonly<S>) => R | null | undefined): Observable<R> {
        return this.select(selector).pipe(
            filter(val => !_.isNil(val)),
            map(val => val!)
        );
    }

}