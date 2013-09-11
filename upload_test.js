/*global describe it before after  =*/

require(["lib/architect/architect", "lib/chai/chai", "/vfs-root"], 
  function (architect, chai, baseProc) {
    var expect = chai.expect;
    
    architect.resolveConfig([
        {
            packagePath : "plugins/c9.core/c9",
            startdate   : new Date(),
            debug       : true,
            smithIo     : "{\"prefix\":\"/smith.io/server\"}",
            staticUrl   : "/static/plugins",
            hosted      : true,
            local       : false,
            projectName : "upload_test"
        },
        
        "plugins/c9.core/ext",
        "plugins/c9.core/events",
        "plugins/c9.core/http",
        "plugins/c9.core/util",
        "plugins/c9.nodeapi/nodeapi",
        "plugins/c9.ide.ui/lib_apf",
        "plugins/c9.core/settings",
        {
            packagePath  : "plugins/c9.ide.ui/ui",
            staticPrefix : "plugins/c9.ide.ui"
        },
        "plugins/c9.ide.tree/tree",
        "plugins/c9.ide.ui/menus",
        "plugins/c9.ide.upload/dragdrop",
        {
            packagePath: "plugins/c9.ide.upload/upload",
            staticPrefix: "plugins/c9.ide.upload"
        },
        {
            packagePath: "plugins/c9.ide.upload/upload_manager",
            filesPrefix: "/workspace"
        },
        {
            packagePath: "plugins/c9.ide.upload/upload_progress",
            staticPrefix: "plugins/c9.ide.upload"
        },        
        {
            packagePath: "plugins/c9.vfs.client/vfs_client",
            smithIo     : {
                "prefix": "/smith.io/server"
            }
        },
        "plugins/c9.ide.auth/auth",
        {
            packagePath: "plugins/c9.fs/fs",
            baseProc: baseProc
        },
        "plugins/c9.fs/fs.cache.xml",
        
        // Mock plugins
        {
            consumes : ["emitter", "apf", "ui"],
            provides : [
                "commands", "commands", "layout", "watcher", 
                "save", "panels", "tabs", "preferences", "anims"
            ],
            setup    : expect.html.mocked
        },
        {
            consumes : ["upload", "dragdrop"],
            provides : [],
            setup    : main
        }
    ], function (err, config) {
        if (err) throw err;
        var app = architect.createApp(config);
        app.on("service", function(name, plugin){ plugin.name = name; });
    });
    
    function main(options, imports, register) {
        var upload  = imports.upload;
        
        // expect.html.setConstructor(function(page){
        //     if (typeof page == "object")
        //         return page.pane.aml.getPage("editor::" + page.editorType).$ext;
        // });
        
        describe('upload', function() {
            before(function(done){
                apf.config.setProperty("allow-select", false);
                apf.config.setProperty("allow-blur", false);
                
                done();
            });
            
            describe("upload dialog", function() {
                it('should open the dialog', function(done) {
                    upload.showUploadWindow();
                    done();
                });
            });
                
            describe("file exists dialog", function() {
                it('should open the dialog', function(done) {
                    var batch = {
                        files: [1, 2]
                    };
                    
                    upload.fileExistsDialog(batch, "/lib", "server.js", function(action, toAll) {
                        console.log("action", action, toAll);
                        done();
                    });
                    
                    upload.getElement("btnUploadSkipAll").dispatchEvent("click");
                });
            });
            
            if (!onload.remain){
                describe("unload()", function(){
                    it('should destroy all ui elements when it is unloaded', function(done) {
                        upload.unload();
                        done();
                    });
                });
                
                after(function(done){
                    document.body.style.marginBottom = "";
                    done();
                });
            }
        });
        
        onload && onload();
    }
});