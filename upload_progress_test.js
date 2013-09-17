/*global describe it before after  =*/

require(["lib/architect/architect", "lib/chai/chai", "/vfs-root"], 
  function (architect, chai, baseProc) {
    var expect = chai.expect;
    
    architect.resolveConfig([
        {
            packagePath : "plugins/c9.core/c9",
            startdate   : new Date(),
            debug       : true,
            staticUrl   : "/static/plugins",
            hosted      : true,
            local       : false
        },
        
        "plugins/c9.core/ext",
        "plugins/c9.core/events",
        "plugins/c9.core/http",
        "plugins/c9.core/util",
        "plugins/c9.ide.ui/lib_apf",
        "plugins/c9.nodeapi/nodeapi",
        "plugins/c9.core/settings",
        "plugins/c9.ide.ui/anims",
        {
            packagePath  : "plugins/c9.ide.ui/ui",
            staticPrefix : "plugins/c9.ide.ui"
        },
        "plugins/c9.ide.tree/tree",
        "plugins/c9.ide.ui/menus",
        {
            packagePath: "plugins/c9.ide.upload/upload_progress",
            staticPrefix: "plugins/c9.ide.layout.classic"
        },
        {
            packagePath: "plugins/c9.ide.upload/upload_manager",
            filesPrefix: "/workspace"
        },
        {
            packagePath : "plugins/c9.vfs.client/vfs_client",
            smithIo     : {
                "path": "/smith.io/server"
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
                "save", "panels", "tabs", "preferences", "clipboard"
            ],
            setup    : expect.html.mocked
        },
        {
            consumes : ["upload_progress", "upload_manager", "settings"],
            provides : [],
            setup    : main
        }
    ], function (err, config) {
        if (err) throw err;
        var app = architect.createApp(config);
        app.on("service", function(name, plugin){ plugin.name = name; });
    });
    
    function main(options, imports, register) {
        var progress = imports.upload_progress;
        var uploadManager = imports.upload_manager;
        
        describe('upload', function() {
            before(function(done){
                imports.settings.set("general/@animateui", true);
                apf.config.setProperty("allow-select", false);
                apf.config.setProperty("allow-blur", false);
                
                var createJob = uploadManager._createJob;
                uploadManager._createJob = function() {
                    var job = createJob.apply(this, arguments);
                    job._startUpload = function() {};
                    return job;
                };
                done();
            });
            
            describe("upload manager", function() {
                it('should open the list', function(done) {
                    progress.show();
                    
                    var job1 = uploadManager.uploadFile({ name: "hello.txt", size: 423}, "/lib/hello.txt");
                    var job2 = uploadManager.uploadFile({ name: "juhu.txt", size: 423}, "/lib/juhu.txt");
                    
                    job1._progress(0.55);
                    
                    done();
                });

            });
            if (!onload.remain){
                describe("unload()", function(){
                    it('should destroy all ui elements when it is unloaded', function(done) {
                        progress.unload();
                        
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