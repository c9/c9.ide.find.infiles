/*global describe it before after  =*/

require(["lib/architect/architect", "lib/chai/chai", "/vfs-root"], 
  function (architect, chai, baseProc) {
    var expect = chai.expect;
    
    architect.resolveConfig([
        {
            packagePath : "plugins/c9.core/c9",
            workspaceId : "ubuntu/ip-10-35-77-180",
            startdate   : new Date(),
            debug       : true,
            hosted      : true,
            local       : false,
            davPrefix   : "/"
        },
        
        "plugins/c9.nodeapi/nodeapi",
        "plugins/c9.core/ext",
        "plugins/c9.core/events",
        "plugins/c9.core/http",
        "plugins/c9.core/util",
        "plugins/c9.ide.console/console",
        "plugins/c9.ide.ui/lib_apf",
        "plugins/c9.ide.ui/tooltip",
        {
            packagePath : "plugins/c9.core/settings",
            settings    : "<settings><user><general animateui='true' /></user></settings>"
        },
        {
            packagePath  : "plugins/c9.ide.ui/ui",
            staticPrefix : "plugins/c9.ide.ui"
        },
        "plugins/c9.ide.editors/document",
        "plugins/c9.ide.editors/undomanager",
        {
            packagePath: "plugins/c9.ide.editors/editors",
            defaultEditor: "ace"
        },
        "plugins/c9.ide.editors/editor",
        {
            packagePath : "plugins/c9.ide.editors/tabs",
            testing : 2
        },
        "plugins/c9.ide.editors/tab",
        "plugins/c9.ide.editors/page",
        "plugins/c9.ide.ace/ace",
        {
            packagePath  : "plugins/c9.ide.find.infiles/findinfiles",
            staticPrefix : "plugins/c9.ide.find.infiles"
        },
        {
            packagePath  : "plugins/c9.ide.find/find",
            basePath     : baseProc
        },
        {
            packagePath : "plugins/c9.ide.find/find.nak",
            ignore       : ""
        },
        "plugins/c9.ide.keys/commands",
        "plugins/c9.fs/proc",
        {
            packagePath: "plugins/c9.vfs.client/vfs_client",
            smithIo     : {
                "path": "/smith.io/server"
            }
        },
        "plugins/c9.ide.auth/auth",
        "plugins/c9.fs/fs",
        
        // Mock plugins
        {
            consumes : ["emitter", "apf", "ui"],
            provides : [
                "commands", "menus", "layout", "watcher", "tree", "clipboard",
                "save", "preferences", "anims", "gotoline", "findreplace"
            ],
            setup    : expect.html.mocked
        },
        {
            consumes : ["findinfiles", "tabs", "console"],
            provides : [],
            setup    : main
        }
    ], function (err, config) {
        if (err) throw err;
        var app = architect.createApp(config);
        app.on("service", function(name, plugin){ plugin.name = name; });
    });
    
    function main(options, imports, register) {
        var findinfiles = imports.findinfiles;
        var tabs        = imports.tabs;
        
        function getPageHtml(page){
            return page.tab.aml.getPage("editor::" + page.editorType).$ext
        }
        
        expect.html.setConstructor(function(page){
            if (typeof page == "object")
                return page.$ext;
        });
        
        describe('ace', function() {
            this.timeout(10000);
            
            before(function(done){
                apf.config.setProperty("allow-select", false);
                apf.config.setProperty("allow-blur", false);
                
                bar.$ext.style.background = "rgba(220, 220, 220, 0.93)";
                bar.$ext.style.position = "absolute";
                bar.$ext.style.left = "20px";
                bar.$ext.style.right = "20px";
                bar.$ext.style.bottom = "50px";
                bar.$ext.style.height = "150px";
      
                document.body.style.marginBottom = "150px";
                done();
            });
            
            describe("open", function(){
                it('should open a tab with just an editor', function(done) {
                    findinfiles.toggle();
                    done();
                });
            });
            
            if (!onload.remain){
                describe("unload", function(){
                    
                    it('should open a tab with just an editor', function(done) {
                        findinfiles.unload();
                        done();
                    });
                });
                
                after(function(done){
                   imports.console.unload();
                   
                   document.body.style.marginBottom = "";
                   done();
               });
            }
        });
        
        onload && onload();
    }
});