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
import {Lab, getProperty, DEFAULT_WIDTH, DEFAULT_HEIGHT} from "./Lab.js";
import {LSystem} from "./lsystem/LSystem.js";

import STYLE from "./view/style.js";
import ABOUT from "./view/about.js";
import HELP from "./view/help.js";

import EXPORT_HTML_TEMPLATE from "./export_html_template.js";
import EMPTY_CONFIGURATION from "./empty_configuration.js";

import {RenderView} from "./view/RenderView.js";
import {DocumentView} from "./view/DocumentView.js";
import {LSystemView} from "./view/LSystemView.js";
import {InterpretationView} from "./view/InterpretationView.js";

import {Command} from "./interpretation/Command.js";

import {Action} from "./view/Action.js";
import {Spacer} from "./view/Spacer.js";

const _lab = new WeakMap();
const _config = new WeakMap();
const _tabs = new WeakMap();
const _paused = new WeakMap();
const _labViewElement = new WeakMap();


const TOP_PADDING = 30; // px
const LEFT_PADDING = 10; // px

const resize = function (labview, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
    const labViewElement = _labViewElement.get(labview);
    labViewElement.style.width = `${width + LEFT_PADDING}px`;
    labViewElement.style.height = `${height + TOP_PADDING}px`;
};

const saveAs = function (labView, extension, dataURI) {
    const name = labView.name.replace(/[ \t\n\r]+/g, "_");

    const a = document.createElement("a");
    a.download = `${name}.${extension}`,
    a.href = dataURI;
    document.body.appendChild(a);
    a.addEventListener("click", () => document.body.removeChild(a));
    a.click();
};

const scriptURL = function () {
    // Get the source code by URL; assuming the script is loaded
    // by a path ending in 'virtual_botanical_laboratory.js'.
    const scripts = Array.from(document.querySelectorAll("script"));
    const labScript = scripts.filter((s) => s.src.endsWith("virtual_botanical_laboratory.js"));
    return labScript[0].src;
};

const tab = function (labview, name) {
    const tabs = _tabs.get(labview);
    if (undefined !== tabs && tabs.hasOwnProperty(name)) {
        return tabs[name];
    } else {
        return undefined;
    }
};

const generateId = function () {
    let randomId;
    do {
        randomId = Math.random().toString(16).slice(2);
    } while (null !== document.getElementById(randomId));

    return randomId;
};

const createTab = function (labview, name, text, tooltip, checked = false, right = false) {
    const tab = document.createElement("li");
    tab.classList.add("tab");
    if (right) {
        tab.classList.add("right");
    }
    tab.dataset.section = name;

    const id = generateId();
    const input = document.createElement("input");
    input.setAttribute("type", "radio");
    input.setAttribute("name", "tabs");
    input.setAttribute("id", id);
    if (checked) {
        input.setAttribute("checked", "checked");
    }
    tab.appendChild(input);

    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.setAttribute("title", tooltip);
    label.innerHTML = text;
    tab.appendChild(label);

    return tab;
};

const updateLSystem = function (labview, lsystemTab) {
    const lsystemString = lsystemTab.lsystem;
    // If the lsystem has been changed, try to parse it and update lsystem
    if (lsystemTab.originalLSystem !== lsystemString) {
        try {
            const lsystem = LSystem.parse(lsystemTab.lsystem);
            labview.reset();
            labview.lab.lsystem = lsystem;
            lsystemTab.originalLSystem = lsystemString;

            // Also update the Interpretation tab's commands
            const interpretationTab = _tabs.get(labview)["interpretation"];
            const interpretation = labview.lab.interpretation;
        
            const availableCommands = {};
            lsystem
                .alphabet
                .moduleDefinitions
                .forEach((md) => {
                    if (!interpretation.hasCommand(md.name)) {
                        availableCommands[md.name] = undefined;
                    }
                });

            const interpretationConfig = _config.get(labview)["interpretation"];
            // Commands can be (re)defined in a configuration of an Interpretation 
            if ("commands" in interpretationConfig) {
                Object
                    .entries(interpretationConfig["commands"])
                    .forEach((entry) => {
                        const [name, func] = entry;
                        availableCommands[name] = func;
                    });
            }

            Object
                .keys(availableCommands)
                .forEach((name) => interpretation.setCommand(name, new Command(availableCommands[name])));

            interpretationTab.updateCommands(interpretation);

            lsystemTab.showMessage("LSystem parsed and updated successfully.", "info", 2000);
            _config.get(labview)["lsystem"] = lsystemString;
        } catch (e) {
            lsystemTab.showMessage(`Error parsing LSystem: "${e}"`, "error");
        }
    }
};

const updateInterpretation = function (labview, interpretationTab) {
    const properties = interpretationTab.properties;
    const commands = interpretationTab.commands;

    const changed = true; // TODO determine if interpretation specification has changed

    if (changed) {
        // update interpretation
        try {

            const config = {};
            Object.entries(properties).forEach(([key, value]) => {
                const registeredProperty = labview.lab.interpretation.getRegisteredProperty(key);
                const converter = registeredProperty["converter"] || function (v) { return v.toString();};
                config[key] = converter.call(null, value);
            });

            const interpretationConfig = {
                "config": config,
                "commands": {}
            };

            _config.get(labview)["interpretation"] = interpretationConfig;

            const lsystem = labview.lab.lsystem.stringify();

            labview.reset();

            labview.lab = new Lab({
                "lsystem": lsystem,
                "interpretation": interpretationConfig
            });
        
            const {width, height} = config;
            resize(labview, width || DEFAULT_WIDTH, height || DEFAULT_HEIGHT);

            // Updated commands
            Object.entries(commands).forEach(([key, func]) => {
                if (undefined !== func && "" !== func) {
                    const modules = labview.lab.lsystem.alphabet.moduleDefinitions;
                    let parameters = [];
                    if (undefined !== modules) {
                        parameters = modules.find((md) => key === md.name);
                        if (undefined !== parameters) {
                            parameters = parameters.parameters;
                        } else {
                            parameters = [];
                        }
                    }

                    const command = new Command(parameters, func);
                    labview.lab.interpretation.setCommand(key, command);
                }
            });

            //labview.lab = labview.lab;
            interpretationTab.showMessage("Interpretation updated successfully…", "info", 2000);
        } catch (e) {
            console.log(e);
            interpretationTab.showMessage(`Error updating interpretation: "${e}"`, "error");
        }
    }
};

const setupTabs = function (labview, element, tabConfig) {
    const tabsElement = document.createElement("ul");
    tabsElement.classList.add("tabs");
    element.appendChild(tabsElement);

    const tabs = {};

    // General "render" tab to view and control L-System
    const renderTabElement = createTab(labview, "render", "♣", "View interpreted L-system", true);
    tabsElement.appendChild(renderTabElement);
    const renderTab = tabs["render"] = new RenderView(renderTabElement, {});

    renderTab.addAction(new Action("create", "★", "Create a new L-system.", () => labview.create()));
    renderTab.addAction(new Action("exportToHtml", "▼ HTML", "Save this L-system to a HTML file.", () => labview.exportToHTML()));
    renderTab.addAction(new Action("exportToPng", "▼ PNG", "Export this L-system to a PNG file.", () => labview.exportToPNG()));

    renderTab.addAction(new Spacer());

    renderTab.addAction(new Action("run", "▶️", "Run this L-system.", () => labview.run()));
    renderTab.addAction(new Action("pause", "⏸", "Pause this L-system.", () => labview.pause()));
    renderTab.addAction(new Action("step", "1", "Derive the next succesor of this L-system.", () => labview.step()));
    renderTab.addAction(new Action("reset", "⏮", "Reset this L-system.", () => labview.reset()));

    // L-System tab to edit L-System definition
    const lsystemTabElement = createTab(labview, "lsystem", "L-system", "Edit L-system");
    tabsElement.appendChild(lsystemTabElement);
    tabs["lsystem"] = new LSystemView(lsystemTabElement, tabConfig.lsystem, {
        header: "L-system definition"
    });
    tabs["lsystem"].addAction(
        new Action(
            "update", 
            "update", 
            "Update this L-system.", 
            () => updateLSystem(labview, tabs["lsystem"])
        )
    );
    
    // Interpretation tab to change properties in the interpretation
    const interpretationTabElement = createTab(labview, "interpretation", "Interpretation", "Edit interpretation");
    tabsElement.appendChild(interpretationTabElement);
    tabs["interpretation"] = new InterpretationView(interpretationTabElement, labview.lab.interpretation, tabConfig.interpretation, {
        header: "Configure interpretation"
    });
    tabs["interpretation"].addAction(
        new Action(
            "update", 
            "update", 
            "Update this L-system.", 
            () => updateInterpretation(labview, tabs["interpretation"])
        )
    );
    
    // About tab with information about the virtual_botanical_lab
    const aboutTabElement = createTab(labview, "about", "i", "About", false, true);
    tabsElement.appendChild(aboutTabElement);
    tabs["about"] = new DocumentView(aboutTabElement, "about", {
        header: "About",
        contents: ABOUT
    });
    
    // Help tab with a manual for the virtual_botanical_lab
    const helpTabElement = createTab(labview, "help", "?", "help", false, true);
    tabsElement.appendChild(helpTabElement);
    tabs["help"] = new DocumentView(helpTabElement, "help", {
        header: "Help",
        contents: HELP
    });

    _tabs.set(labview, tabs);
};

const createLabView = function (labview, parentElementOrSelector, config) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const template = document.createElement("div");
    template.classList.add("lab-view");

    let elt;
    if (parentElementOrSelector instanceof Node) {
        elt = parentElementOrSelector;
    } else {
        elt = document.querySelector(parentElementOrSelector);
    }

    if (elt.firstChild) {
        elt.insertBefore(template, elt.firstChild);
    } else {
        elt.append(template);
    }

    setupTabs(labview, template, config);

    return elt;
};

/**
 * A user interface for a Lab.
 *
 * @property {Lab} lab
 * @property {String} name
 * @property {String} description
 * @property {Object} configuration
 */
class LabView {

    /**
     * Create a new LabView.
     *
     * @param {HTMLElement|String} parentElementOrSelector - the parent
     * element, or a selector to the parent element, to which this LabView
     * will be appended.
     * @param {Object} [config = {}] - the initial configuration of this
     * LabView.
     */
    constructor(parentElementOrSelector, config = {}) {
        // TODO: It is probably a good idea to validate the config first, though.
        _config.set(this, Object.create(null, {}));
        Object.assign(_config.get(this), config);
        _lab.set(this, new Lab(config));

        _labViewElement.set(this,  createLabView(this, parentElementOrSelector, config));

        const {width, height} = config.interpretation;
        resize(this, width || DEFAULT_WIDTH, height || DEFAULT_HEIGHT);
        
        this.lab = this.lab;

        _paused.set(this, false);
    }

    get name() {
        let name = "virtual_plant";
        if (this.lab && this.lab.lsystem && "" !== this.lab.lsystem.name) {
            name = this.lab.lsystem.name;
        }
        return name;
    }

    get description() {
        let description = "Plant generated by the virtual botanical laboratory.";
        if (this.lab && this.lab.lsystem && "" !== this.lab.lsystem.description) {
            description = this.lab.lsystem.description;
        }
        return description;
    }

    get configuration() {
        return JSON.stringify({
            "name": this.name,
            "description": this.description,
            "lsystem": _config.get(this)["lsystem"],
            "interpretation": _config.get(this)["interpretation"]
        }, null, 4);
    }

    get lab() {
        return _lab.get(this);
    }

    set lab(newLab) {
        _lab.set(this, newLab);
        tab(this, "render").canvas = this.lab.element;
    }

    // Control the lab view

    /**
     * Set a property
     *
     * @param {String} sectionName
     * @param {String} key
     * @param {String|Boolean|Number} value
     */
    set(sectionName, key, value) {
        let section = _config.get(this)[sectionName];
        if (undefined === section) {
            section = Object.create(null);
            _config.get(this)[sectionName] = section;
        }
        section[key] = value;
    }

    /**
     * Get a property
     *
     * @param {String} sectionName
     * @param {String} key
     * @returns {String|Boolean|Number} the value of the key
     */
    get(sectionName, key) {
        const section = _config.get(this)[sectionName];
        return undefined === section ? section[key] : undefined;
    }

    // File and export actions

    /**
     * Create an empty Lab in a new window/tab.
     */
    create() {
        const htmlCode = EXPORT_HTML_TEMPLATE
            .replace(/__NAME__/, "New_lab")
            .replace(/__SOURCE_URL__/, scriptURL())
            .replace(/__DESCRIPTION__/, "New Lab. See '?' for help.")
            .replace(/__CONFIGURATION__/, EMPTY_CONFIGURATION)
        ;

        const newLabWindow = window.open();
        newLabWindow.document.write(htmlCode);
        newLabWindow.document.close();
    }

    /**
     * Export the current lsystem and its configuration to a stand-alone HTML
     * file.
     */
    exportToHTML() {
        if (undefined !== this.lab) {
            const htmlCode = "<!DOCTYPE html>\n<html>\n" + 
                EXPORT_HTML_TEMPLATE
                .replace(/__NAME__/, this.name)
                .replace(/__SOURCE_URL__/, scriptURL())
                .replace(/__DESCRIPTION__/, this.description)
                .replace(/__CONFIGURATION__/, this.configuration)
            ;

            const data = new Blob([htmlCode], {type: "text/html"});
            saveAs(this, "html", URL.createObjectURL(data));
        }
    }

    /**
     * Export the current interpretation to a PNG file.
     */
    exportToPNG() {
        if (undefined !== this.lab) {
            const dataURI = this.lab
                .interpretation
                .canvasElement
                .toDataURL("image/png")
                .replace(/^data:image\/[^;]/, "data:application/octet-stream");
            
            saveAs(this, "png", dataURI);
        }
    }

    // Control a lab actions

    /**
     * Start deriving successors until this L-system's derivationLength has
     * been reached.
     */
    run() {
        if (undefined !== this.lab) {
            const derivationLength = getProperty(_config.get(this), "interpretation.config.derivationLength", 0);

            const steps = derivationLength - this.lab.lsystem.derivationLength;
            this.lab.run(steps);

            _paused.set(this, false);
        }
    }

    /**
     * Derive the next successor for this L-system
     */
    step() {
        if (undefined !== this.lab) {
            this.lab.run(1);
        }
    }

    /**
     * Stop the automatic derivation of this L-system
     */
    pause() {
        if (undefined !== this.lab) {
            this.lab.stop();
            _paused.set(this, true);
        }
    }

    /**
     * Is this L-system paused?
     */
    isPaused() {
        return true === _paused.get(this);
    }

    /**
     * Reset this L-system back to the axiom
     */
    reset() {
        if (undefined !== this.lab) {
            this.lab.reset();
            _paused.set(this, false);
        }
    }
}

export {
    LabView
};
