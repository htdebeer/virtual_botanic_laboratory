/*
 * Copyright 2017 Huub de Beer <huub@heerdebeer.org>
 *
 * This file is part of virtual_botanical_laboratory.
 *
 * virtual_botanical_laboratory is free software: you can redistribute it
 * and/or modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * virtual_botanical_laboratory is distributed in the hope that it will be
 * useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General
 * Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with virtual_botanical_laboratory.  If not, see
 * <http://www.gnu.org/licenses/>.
 * 
 */
import {LSystem} from "./lsystem/LSystem.js";
import {Interpretation} from "./interpretation/Interpretation.js";
import {CanvasTurtleInterpretation} from "./interpretation/CanvasTurtleInterpretation.js";

import {Command} from "./interpretation/Command.js";

const SIZE = 1000; // px
const SPEED = 500; // ms

const _element = new WeakMap();
const _lsystem = new WeakMap();
const _interpretation = new WeakMap();
const _description = new WeakMap();

const _running = new WeakMap();
const _animate = new WeakMap();
const _speed = new WeakMap();

const createInterpretation = function (lab, interpretationConfig = {}) {
    let interpretation;
    if (!(interpretationConfig instanceof Interpretation)) {
        if ("canvas" === interpretationConfig.type) {
            const element = document.createElement("canvas");
            element.width = SIZE;
            element.height = SIZE;
            
            _element.set(lab, element);
            
            interpretation = new CanvasTurtleInterpretation(element.getContext("2d"), interpretationConfig.config);
        } else {
            // not implemented yet
            throw new Error("Only the canvas format has been implemented yet.");
        }

        if ("commands" in interpretationConfig) {
            Object
                .entries(interpretationConfig["commands"])
                .forEach((entry) => {
                    const [name, func] = entry;
                    interpretation.setCommand(name, new Command(func))
                });
        }
    } else {
        interpretation = interpretationConfig;
    }

    _interpretation.set(lab, interpretation);
};

const createLSystem = function (lab, lsystem = "") {

    if (!(lsystem instanceof LSystem)) {
        // Interpret lsystem as a string to parse into an LSystem. Will
        // throw a parse error if it does not succeed
        lsystem = LSystem.parse(lsystem);
    }

    _lsystem.set(lab, lsystem);
};

const initializeAndRun = function (lab, derivationLength = 0) {
    if (!Number.isInteger(derivationLength) || 0 >= derivationLength) {
        derivationLength = 0;
    }
    lab.run(derivationLength);
};

const animateDeriving = function (lab, steps, currentStep) {
    if (_running.get(lab) && currentStep < steps) {
        setTimeout(() => {
            lab.interpretation.render(lab.derive());
            animateDeriving(lab, steps, currentStep + 1)
        }, _speed.get(lab));
    } else {
        _running.set(lab, false);
    }
};

const setupAnimation = function (lab, animate = false) {
    if (Number.isInteger(animate)) {
        if (0 < animate) {
            _animate.set(lab, true);
            _speed.set(lab, animate);
        } else {
            _animate.set(lab, false);
            _speed.set(lab, undefined);
        }
    } else if (animate && true === animate) {
        _animate.set(lab, true);
        _speed.set(lab, SPEED);
    } else {
        _animate.set(lab, false);
        _speed.set(lab, undefined);
    }
}

/**
 * Lab is the public API to interact with an lsystem and its interpretation.
 * Use this class to build an application on top of.
 *
 * Each Lab has a valid LSystem and a corresponding Interpretation. 
 *
 * @property {HTMLElement} element with the interpretation of the lsystem
 * @property {Interpretation} interpretation of the lsystem
 * @property {LSystem} lsystem being interpreted
 * @property {Boolean|Number} animate - control the animation of the
 * Interpretation
 */
class Lab {
    constructor(config = {}) {
        _running.set(this, false);

        createLSystem(this, config.lsystem || "");
        createInterpretation(this, config.interpretation);
        setupAnimation(this, config.animate);

        initializeAndRun(this, config.derivationLength);
    }

    get element() {
        return _element.get(this);
    }

    get interpretation() {
        return _interpretation.get(this);
    }

    set interpretation(config = {}) {
        createInterpretation(this, config);
    }

    set lsystem(lsystem) {
        createLSystem(this, lsystem);
    }

    get lsystem() {
        return _lsystem.get(this);
    }

    get animate() {
        return _animate.get(this);
    }

    set animate(animate) {
        setupAnimation(this, animate);
    }
        
    // actions
    // control rendering

    /** 
     * Run this Lab by deriving this Lab's lsystem's successor for steps
     * times and interpret it.
     *
     * @param {Number} [steps = 0] - the number of derivations to perform.
     */
    run(steps = 0) {
        if (this.animate) {
            _running.set(this, true);
            animateDeriving(this, steps, 0);
        } else {
            this.interpretation.render(this.derive(steps));
        }
    }

    /**
     * Stop running this Lab.
     */
    stop() {
        _running.set(this, false);
    }

    /**
     * Derive the next sequence from this Lab's LSystem.
     *
     * @param {Integer} [derivationLength = 1] - the number of derivations to
     * perform, defaults to one step.
     *
     * @returns {ModuleTree} successor
     */
    derive(length = 1) {
        return this.lsystem.derive(length);
    }

    /**
     * Reset this lab to its initial state.
     */
    reset() {
        this.interpretation.reset();
        this.lsystem.reset(); 
    }
}

export {
    Lab
}
