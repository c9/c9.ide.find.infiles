define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "c9", "util", "settings", "ui", "layout", "findreplace", 
        "find", "anims", "menus", "tabManager", "commands", "tooltip", 
        "tree", "apf", "console", "preferences", "dialog.question"
    ];
    main.provides = ["findinfiles"];
    return main;

    function main(options, imports, register) {
        var c9          = imports.c9;
        var util        = imports.util;
        var Plugin      = imports.Plugin;
        var settings    = imports.settings;
        var ui          = imports.ui;
        var anims       = imports.anims;
        var menus       = imports.menus;
        var commands    = imports.commands;
        var console     = imports.console;
        var layout      = imports.layout;
        var tooltip     = imports.tooltip;
        var tabs        = imports.tabManager;
        var tree        = imports.tree;
        var findreplace = imports.findreplace;
        var prefs       = imports.preferences;
        var find        = imports.find;
        var question    = imports["dialog.question"].show;

        var markup    = require("text!./findinfiles.xml");
        var lib       = require("plugins/c9.ide.find.replace/libsearch");

        /***** Initialization *****/

        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();

        var libsearch = lib(settings, execFind, toggleDialog, function(){});

        // Make ref available for other search implementations (specifically searchreplace)
        lib.findinfiles = plugin;

        var position, returnFocus, lastActiveAce;

        // ui elements
        var txtSFFind, txtSFPatterns, chkSFMatchCase;
        var chkSFRegEx, txtSFReplace, chkSFWholeWords, searchRow, chkSFConsole;
        var winSearchInFiles, ddSFSelection, tooltipSearchInFiles, btnSFFind;
        var btnSFReplaceAll, btnCollapse;

        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;

            commands.addCommand({
                name    : "searchinfiles",
                hint    : "search for a string through all files in the current workspace",
                bindKey : {mac: "Shift-Command-F", win: "Ctrl-Shift-F"},
                exec    : function () {
                    toggleDialog(1);
                }
            }, plugin);

            menus.addItemByPath("Find/~", new apf.divider(), 10000, plugin),
            menus.addItemByPath("Find/Find in Files...", new apf.item({
                command : "searchinfiles"
            }), 20000, plugin);

            settings.on("read", function(e){
                settings.setDefaults("state/findinfiles", [
                    ["regex", "false"],
                    ["matchcase", "false"],
                    ["wholeword", "false"],
                    ["console", "true"]
                ]);
                settings.setDefaults("user/findinfiles", [
                    ["consolelaunch", "false"],
                    ["fullpath", "false"],
                    ["scrolldown", "false"],
                    ["clear", "true"]
                ]);
            }, plugin);

            prefs.add({
               "General" : {
                   "Find in Files" : {
                       position : 30,
                        "Show Full Path in Results" : {
                            type     : "checkbox",
                            position : 100,
                            path     : "user/findinfiles/@fullpath"
                        },
                        "Clear Results Before Each Search" : {
                            type     : "checkbox",
                            position : 100,
                            path     : "user/findinfiles/@clear"
                        },
                        "Scroll Down as Search Results Come In" : {
                            type     : "checkbox",
                            position : 100,
                            path     : "user/findinfiles/@scrolldown"
                        },
                        "Open Files when Navigating Results with ↓ ↑" : {
                            type     : "checkbox",
                            position : 100,
                            path     : "user/findinfiles/@consolelaunch"
                        }
                   }
               }
            }, plugin);

            tabs.on("focus", function(e){
                if (e.tab.editor.type == "ace" 
                  && searchPanel[true] != e.tab 
                  && searchPanel[false] != e.tab) {
                    lastActiveAce = e.tab;
                }
            }, plugin);
            
            var tab = tabs.focussedTab;
            lastActiveAce = tab && tab.editor.type == "ace" ? tab : null;
            
            // Context Menu
            tree.getElement("mnuCtxTree", function(mnuCtxTree) {
                menus.addItemToMenu(mnuCtxTree, new apf.item({
                    match   : "file|folder|project",
                    command : "searchinfiles",
                    caption : "Search in files"
                }), 410, plugin);
            });
        }

        var drawn = false;
        function draw(){
            if (drawn) return;
            drawn = true;

            // Create UI elements
            searchRow = layout.findParent(plugin);
            ui.insertMarkup(null, markup, plugin);

            txtSFFind        = plugin.getElement("txtSFFind");
            txtSFPatterns    = plugin.getElement("txtSFPatterns");
            chkSFMatchCase   = plugin.getElement("chkSFMatchCase");
            chkSFRegEx       = plugin.getElement("chkSFRegEx");
            txtSFReplace     = plugin.getElement("txtSFReplace");
            chkSFWholeWords  = plugin.getElement("chkSFWholeWords");
            chkSFConsole     = plugin.getElement("chkSFConsole");
            ddSFSelection    = plugin.getElement("ddSFSelection");
            btnSFFind        = plugin.getElement("btnSFFind");
            winSearchInFiles = plugin.getElement("winSearchInFiles");
            btnSFReplaceAll  = plugin.getElement("btnSFReplaceAll");
            btnCollapse      = plugin.getElement("btnCollapse");
            tooltipSearchInFiles = plugin.getElement("tooltipSearchInFiles");

            btnSFFind.on("click", function(){ execFind(); });
            btnSFReplaceAll.on("click", function(){ execReplace(); });
            btnCollapse.on("click", function(){ toggleDialog(-1); });

            var control;
            txtSFReplace.on("focus", function(){
                if (control) control.stop();
                control = {};

                // I'd rather use css anims, but they didn't seem to work
                apf.tween.single(txtSFReplace.$ext.parentNode, {
                    type     : "boxFlex",
                    from     : txtSFReplace.$ext.parentNode.style[apf.CSSPREFIX + "BoxFlex"] || 1,
                    to       : 3,
                    anim     : apf.tween.easeOutCubic,
                    control  : control,
                    steps    : 15,
                    interval : 1
                });
            });
            txtSFReplace.on("blur", function(){
                if (txtSFReplace.getValue())
                    return;

                if (control) control.stop();
                control = {};

                // I'd rather use css anims, but they didn't seem to work
                apf.tween.single(txtSFReplace.$ext.parentNode, {
                    type     : "boxFlex",
                    from     : txtSFReplace.$ext.parentNode.style[apf.CSSPREFIX + "BoxFlex"] || 3,
                    to       : 1,
                    anim     : apf.tween.easeOutCubic,
                    control  : control,
                    steps    : 15,
                    interval : 1
                });
            });

            commands.addCommand({
                name        : "hidesearchinfiles",
                bindKey     : {mac: "ESC", win: "ESC"},
                isAvailable : function(editor){
                    return winSearchInFiles.visible;
                },
                exec : function(env, args, request) {
                    toggleDialog(-1);
                }
            }, plugin);
    
            winSearchInFiles.on("prop.visible", function(e) {
                if (e.value) {
                    tree.on("select", setSearchSelection);
                    setSearchSelection();
                }
                else {
                    if (tree)
                        tree.off("select", setSearchSelection);
                }
            });

            txtSFFind.ace.session.on("change", function() {
                if (chkSFRegEx.checked)
                    libsearch.checkRegExp(txtSFFind, tooltipSearchInFiles, winSearchInFiles);
            });
            libsearch.addSearchKeyboardHandler(txtSFFind, "searchfiles");

            var kb = libsearch.addSearchKeyboardHandler(txtSFReplace, "replacefiles");
            kb.bindKeys({
                "Return|Shift-Return": function(){ execReplace(); }
            });

            kb = libsearch.addSearchKeyboardHandler(txtSFPatterns, "searchwhere");
            kb.bindKeys({
                "Return|Shift-Return": function(){ execFind(); }
            });

            var tt = document.body.appendChild(tooltipSearchInFiles.$ext);
    
            chkSFRegEx.on("prop.value", function(e){
                libsearch.setRegexpMode(txtSFFind, apf.isTrue(e.value));
            });

            var cbs = winSearchInFiles.selectNodes("//a:checkbox");
            cbs.forEach(function(cb){
                tooltip.add(cb.$ext, {
                    message : cb.label,
                    width   : "auto",
                    timeout : 0,
                    tooltip : tt,
                    animate : false,
                    getPosition : function(){
                        var pos = ui.getAbsolutePosition(winSearchInFiles.$ext);
                        var left = pos[0] + cb.getLeft();
                        var top = pos[1];
                        return [left, top - 16];
                    }
                }, plugin);
            });

            tooltip.add(txtSFPatterns.$ext, {
                message : txtSFPatterns.label,
                width   : "auto",
                timeout : 0,
                tooltip : tt,
                animate : false,
                getPosition : function(){
                    var pos = ui.getAbsolutePosition(winSearchInFiles.$ext);
                    var left = pos[0] + txtSFPatterns.getLeft();
                    var top = pos[1];
                    return [left, top - 16];
                }
            }, plugin);

            // Offline
            c9.on("stateChange", function(e){
                // Online
                if (e.state & c9.STORAGE) {
                    winSearchInFiles.enable();
                }
                // Offline
                else {
                    winSearchInFiles.disable();
                    btnCollapse.enable();
                }
            }, plugin);

            emit("draw");
        }

        /***** Methods *****/

        function getSearchResultPages() {
            return tabs.getTabs().filter(function(tab) {
                return tab.document.meta.searchResults;
            });
        }

        function setSearchSelection(e){
            var path, node, name, parts;

            if (tree.selected) {
                // If originating from an event
                node = e && e.nodes[0] || tree.selectedNode;
                parts = node.path.split("/");

                // get selected node in tree and set it as selection
                name = "";
                if (node.isFolder)
                    name = parts[parts.length - 1];
                else
                    name = parts[parts.length - 2];

                if (name.length > 25)
                    name = name.substr(0, 22) + "...";
            }
            else {
                path = settings.get("user/tree_selection/@path") || "/";
                parts = path.split("/");
                if ((name = parts.pop()).indexOf(".") > -1)
                    name = parts.pop();
            }

            ddSFSelection.childNodes[1].setAttribute("caption",
                apf.escapeXML("Selection: " + (name || "/")));

            if (ddSFSelection.value == "selection") {
                ddSFSelection.setAttribute("value", "");
                ddSFSelection.setAttribute("value", "selection");
            }
        }

        function getSelectedTreePath() {
            var node = tree.selectedNode;
            if (!node.isFolder)
                node = node.parent || node;
            return node.path;
        }

        function toggleDialog(force, isReplace, noselect, callback) {
            draw();

            tooltipSearchInFiles.$ext.style.display = "none";

            if (!force && !winSearchInFiles.visible || force > 0) {
                if (winSearchInFiles.visible) {
                    txtSFFind.focus();
                    txtSFFind.select();
                    return;
                }

                var winFindReplace;
                try{
                    winFindReplace = findreplace.getElement("winSearchReplace");
                } catch(e) {}
                if (winFindReplace && winFindReplace.visible) {
                    findreplace.toggle(-1, null, true, function(){
                        toggleDialog(force, isReplace, noselect);
                    });
                    return;
                }

                winSearchInFiles.$ext.style.overflow = "hidden";
                winSearchInFiles.$ext.style.height =
                    winSearchInFiles.$ext.offsetHeight + "px";

                position = -1;
    
                var tab = tabs.focussedTab;
                var editor = tab && tab.editor;
                
                if (editor && editor.type == "ace") {
                    var ace   = editor.ace;

                    if (!ace.selection.isEmpty()) {
                        txtSFFind.setValue(ace.getCopyText());
                        libsearch.setRegexpMode(txtSFFind, chkSFRegEx.checked);
                    }
                }

                searchRow.appendChild(winSearchInFiles);
                winSearchInFiles.show();
                txtSFFind.focus();
                txtSFFind.select();

                winSearchInFiles.$ext.scrollTop = 0;
                document.body.scrollTop = 0;

                // Animate
                anims.animateSplitBoxNode(winSearchInFiles, {
                    height         : winSearchInFiles.$ext.scrollHeight + "px",
                    duration       : 0.2,
                    timingFunction : "cubic-bezier(.10, .10, .25, .90)"
                }, function() {
                    winSearchInFiles.$ext.style.height = "";
                });

                btnCollapse.setValue(1);
            }
            else if (winSearchInFiles.visible) {
                if (txtSFFind.getValue())
                    libsearch.saveHistory(txtSFFind.getValue(), "searchfiles");

                // Animate
                winSearchInFiles.visible = false;

                winSearchInFiles.$ext.style.height =
                    winSearchInFiles.$ext.offsetHeight + "px";

                anims.animateSplitBoxNode(winSearchInFiles, {
                    height         : 0,
                    duration       : 0.2,
                    timingFunction : "ease-in-out"
                }, function(){
                    winSearchInFiles.visible = true;
                    winSearchInFiles.hide();
                    winSearchInFiles.parentNode.removeChild(winSearchInFiles);

                    winSearchInFiles.$ext.style[apf.CSSPREFIX + "TransitionDuration"] = "";

                    if (!noselect && tabs.focussedTab)
                        tabs.focusTab(tabs.focussedTab); 

                    setTimeout(function(){
                        callback
                            ? callback()
                            : apf.layout.forceResize();
                    }, 50);
                });

                btnCollapse.setValue(0);
            }

            return false;
        }

        function searchinfiles() {
            toggleDialog(1);
        }

        function getOptions() {
            return {
                query         : txtSFFind.getValue().replace(/\\n/g, "\n"),
                pattern       : txtSFPatterns.getValue(),
                casesensitive : chkSFMatchCase.checked,
                regexp        : chkSFRegEx.checked,
                replaceAll    : false,
                replacement   : txtSFReplace.getValue(),
                wholeword     : chkSFWholeWords.checked,
                path          : getTargetFolderPath()
            };
        }
        
        function getTargetFolderPath() {
            // Determine the scope of the search
            var path;
            if (ddSFSelection.value == "project") {
                path = "/";
            }
            else if (!tree.selected) {
                var paths = settings.getJson("user/tree_selection");
                if (!paths || !(path = paths[0]))
                    path = "/";
            }
            if (!path) {
                path = getSelectedTreePath();
            }
            return path;
        }

        function execReplace(options){
            if (options) {
                options.replaceAll = true;
                execFind(options);
                return;
            }
            
            options = getOptions();
            if (options.replacement || txtSFReplace.ace.isFocused()) {
                execReplace(options);
            } else {
                question(
                    "Replace in files",
                    "Replace all occurrences of " + (options.query) + " in " + options.path,
                    "Do you want continue? (This change cannot be undone)",
                    function(all){ // Yes
                        execReplace(options);
                    },
                    function(all, cancel){ // No
                    },
                    { all: false }
                );
            }
        }

        function execFind(options) {
            options = options || getOptions();

            // Open Console
            if (chkSFConsole.checked)
                console.show();
            
            makeSearchResultsPanel(function(err, tab){
                if (err) {
                    console.error("Error creating search panel");
                    return;
                }
                
                var editor     = tab.editor;
                var session    = tab.document.getSession();
                var acesession = session.session;
                var doc        = acesession.getDocument();
                var renderer   = editor.ace.renderer;

                if (settings.getBool("user/findinfiles/@clear"))
                    doc.setValue("");

                appendLines(doc, messageHeader(options.path, options));

                function dblclick() {
                    if (tab.isActive())
                        launchFileFromSearch(editor.ace);
                }

                if (!session.searchInited) {
                    session.searchInited = true;
                    
                    renderer.scroller.addEventListener("dblclick", dblclick);
                    editor.ace.container.addEventListener("keydown", function(e) {
                        if (e.keyCode == 13) { // ENTER
                            if (e.altKey === false) {
                                launchFileFromSearch(editor.ace);
                                returnFocus = false;
                            }
                            else {
                                editor.insert("\n");
                            }
                            return false;
                        }
                    });

                    editor.ace.container.addEventListener("keyup", function(e) {
                        if (e.keyCode >= 37 && e.keyCode <= 40) { // KEYUP or KEYDOWN
                            if (settings.getBool("user/findinfiles/@consolelaunch")) {
                                launchFileFromSearch(editor.ace);
                                returnFocus = true;
                                return false;
                            }
                        }
                    });
                    
                    tab.on("unload", function(){
                        renderer.scroller.removeEventListener("dblclick", dblclick);
                    });
                }

                if (ddSFSelection.value == "active") {
                    var filename = lastActiveAce && lastActiveAce.isActive()
                        && lastActiveAce.path;

                    if (!filename) {
                        appendLines(doc, "Error: There is no active file. "
                            + "Focus the editor you want to search and try again.\n");
                        return;
                    }

                    options.pattern = filename;
                    // options.path    = dirname(filename);
                }
                else if (ddSFSelection.value == "open") {
                    var files = [];
                    if (options.pattern) files.push(options.pattern);
                    tabs.getTabs().forEach(function(tab){
                        if (tab.path) files.push(tab.path);
                    });

                    if (!files.length) {
                        appendLines(doc, "Error: There are no open files. "
                            + "Open some files and try again.\n");
                        return;
                    }

                    options.pattern = files.join(",");
                }

                // Set loading indicator
                tab.className.remove("changed");
                tab.className.add("loading");

                // Regexp for chrooted path
                var reBase = settings.getBool("user/findinfiles/@fullpath")
                    ? false
                    : new RegExp("^" + util.escapeRegExp(find.basePath), "g");

                find.findFiles(options, function(err, stream) {
                    if (err) {
                        appendLines(doc, "Error executing search: " + err.message);
                        tab.className.remove("loading");
                        tab.className.add("error");
                        return;
                    }

                    var firstRun = true;
                    stream.on("data", function(chunk){
                        if (firstRun && !settings.getBool("user/findinfiles/@scrolldown")) {
                            var currLength = doc.getLength() - 3; // the distance to the last message
                            editor.ace.scrollToLine(currLength, false, true);
                            firstRun = false;
                        }
                        appendLines(doc,
                            reBase ? chunk.replace(reBase, "") : chunk);
                    });
                    stream.on("end", function(data){
                        appendLines(doc, "\n", tab);
                        tab.className.remove("loading");
                        tab.className.add("changed");
                    });
                });

                libsearch.saveHistory(options.query, "searchfiles");
                position = 0;

                // ide.dispatchEvent("track_action", {type: "searchinfiles"});
            });
        }

        function launchFileFromSearch(editor) {
            var session = editor.getSession();
            var currRow = editor.getCursorPosition().row;

            var clickedLine = session.getLine(currRow).split(": "); // number:text
            if (clickedLine.length < 2) // some other part of the editor
                return;

            // "string" type is the parent filename
            while (currRow --> 0) {
                var token = session.getTokenAt(currRow, 0);
                if (token && token.type.indexOf("string") != -1)
                    break;
            }

            var path = editor.getSession().getLine(currRow);

            if (path.charAt(path.length - 1) == ":")
                path = path.substring(0, path.length-1);

            var basePath = find.basePath.replace(/[\\\/]+/g, "/");
            path = path.replace(/[\\\/]+/g, "/")
                .replace(new RegExp("^" + util.escapeRegExp(basePath)), "");

            if (path.charAt(0) != "/")
                path = "/" + path;

            if (!path)
                return;

            var row = parseInt(clickedLine[0], 10) - 1;
            var range = editor.getSelectionRange();
            var offset = clickedLine[0].length + 2;

            tabs.open({
                path      : path,
                active    : true,
                document  : {}
            }, function(err, tab){
                if (err) return;
                
                tab.editor.setState(tab.document, {
                    jump : {
                        row       : row,
                        column    : range.start.column - offset,
                        select    : {
                            row    : row,
                            column : range.end.column - offset
                        }
                    }
                });
                
                tabs.focusTab(returnFocus
                    ? searchPanel[chkSFConsole.checked]
                    : tab);
            });
        }

        function appendLines(doc, content) {
            if (!content || (!content.length && !content.count)) // blank lines can get through
                return;

            if (typeof content != "string")
                content = content.join("\n");

            if (content.length > 0) {
                if (!settings.getBool("user/findinfiles/@scrolldown")) {
                    doc.ace.$blockScrolling++;
                    doc.insert({row: doc.getLength(), column: 0}, content);
                    doc.ace.$blockScrolling--;
                }
                else
                    doc.insert({row: doc.getLength(), column: 0}, content);
            }
        }

        function messageHeader(path, options) {
            var optionsDesc = [];

            if (options.regexp === true)
                optionsDesc.push("regexp");
            if (options.casesensitive === true)
                optionsDesc.push("case sensitive");
            if (options.wholeword === true)
                optionsDesc.push("whole word");

            if (optionsDesc.length > 0)
                optionsDesc = "\x01" + optionsDesc.join(", ") + "\x01";
            else
                optionsDesc = "";

            var replacement = "";
            if (options.replaceAll)
                replacement = "\x01, replaced as \x01" + options.replacement ;

            if (ddSFSelection.value == "project")
                path = "the entire project";
            else if (ddSFSelection.value == "active")
                path = "the active file";
            else if (ddSFSelection.value == "open")
                path = "all open files";

            return "Searching for \x01" + options.query + replacement
                + "\x01 in\x01" + path + "\x01" + optionsDesc + "\n\n";
        }

        var searchPanel = {};
        function makeSearchResultsPanel(callback) {
            var tab = searchPanel[chkSFConsole.checked];
            
            if (!tab || !tab.loaded) {
                searchPanel[chkSFConsole.checked] = tabs.open({
                    path     : "", // This allows the tab to be saved
                    pane     : chkSFConsole.checked 
                        ? console.container.selectSingleNode("tab").cloud9pane 
                        : tabs.getPanes()[0],
                    value    : -1,
                    active   : true,
                    document : {
                        title : "Search Results",
                        meta  : {
                            searchResults: true,
                            ignoreSave   : true
                        },
                        "ace" : {
                            customSyntax : "c9search",
                            options      : {
                                useWrapMode         : true,
                                wrapToView          : true
                            }
                        }
                    },
                    editorType : "ace",
                    name: "searchResults"
                }, function(err, tab, done){
                    // Ref for appendLines
                    var doc = tab.document.getSession().session.getDocument();
                    doc.ace = tab.editor.ace;
                    
                    callback(err, tab);
                    done && done();
                });
            }
            else {
                tabs.focusTab(tab);
                callback(null, tab);
            }
        }

        /***** Lifecycle *****/

        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){

        });
        plugin.on("disable", function(){

        });
        plugin.on("unload", function(){
            loaded = false;
        });

        /***** Register and define API *****/

        /**
         * Implements the search in files UI for Cloud9 IDE.
         * @singleton
         */
        /**
         * Fetches a ui element. You can use this method both sync and async.
         * 
         * The search in files plugin has the following elements:
         * 
         * * txtSFFind - `{@link ui.textbox}`
         * * txtSFPatterns - `{@link ui.textbox}`
         * * chkSFMatchCase - `{@link ui.checkbox}`
         * * chkSFRegEx - `{@link ui.checkbox}`
         * * txtSFReplace - `{@link ui.button}`
         * * chkSFWholeWords - `{@link ui.checkbox}`
         * * chkSFConsole - `{@link ui.checkbox}`
         * * ddSFSelection - `{@link ui.dropdown}`
         * * btnSFFind - `{@link ui.button}`
         * * winSearchInFiles - `{@link ui.window}`
         * * btnSFReplaceAll - `{@link ui.button}`
         * * btnCollapse - `{@link ui.button}`
         * * tooltipSearchInFiles - `{@link ui.label}`
         * 
         * @method getElement
         * @param {String}   name       the id of the element to fetch.
         * @param {Function} [callback] the function to call when the 
         *     element is available (could be immediately)
         */
        plugin.freezePublicAPI({
            /**
             * Toggles the visibility of the search in files panel.
             * @param {Number} force  Set to -1 to force hide the panel, 
             *   or set to 1 to force show the panel.
             */
            toggle : toggleDialog
        });

        register(null, {
            findinfiles: plugin
        });
    }
});
