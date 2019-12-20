var fs = require('fs');
var CodeGen = require('swagger-typescript-codegen').CodeGen;
var nodegit = require("nodegit");
var fse = require("fs-extra");


/*VARIABLES*/
var WORK_DIR = 'scripts/codegen/';
var SWAGGER_FILE_NAME = 'waiter-income/scripts/codegen/spec.json';
var OUTPUT_DIR = 'src/generated/client/';
var REPO_FILESYSTEM_PATH = WORK_DIR + 'waiter-income';
var REPO_URL = "https://github.com/amadeuszi/waiter-income.git";


/*RUN SCRIPT*/
if (fs.existsSync(REPO_FILESYSTEM_PATH)) {
    gitPull(REPO_FILESYSTEM_PATH, generateSourceCodeFromSwagger);
} else {
    gitClone(REPO_FILESYSTEM_PATH, REPO_URL, generateSourceCodeFromSwagger);
}


/*SCRIPT*/
function generateSourceCodeByTags(swagger) {
    for (var group of groupPathsByTags(swagger)) {
        var oneGroupOfPaths = {};
        var tagName = '';
        for (var pathRepresentation of group) {
            oneGroupOfPaths[pathRepresentation.pathName] = pathRepresentation.pathObject;
            tagName = pathRepresentation.tag;
        }
        swagger.paths = oneGroupOfPaths;
        generateSourceCode(tagName, swagger);
    }
}

function generateSourceCode(generatedClassName, swagger) {
    var generatedCode = CodeGen.getTypescriptCode({
        className: generatedClassName,
        swagger: swagger
    });
    var outputFilePath = OUTPUT_DIR + generatedClassName + 'Client.ts';
    writeToFile(outputFilePath, generatedCode);
}

function generateSourceCodeFromSwagger(swaggerFileName) {
    console.log('JAVASCRIPT CODE GENERATION FROM SWAGGER');
    console.log('--------------------------------------');
    console.log('Generated files: ');
    var swagger = readFileToJSON(WORK_DIR + swaggerFileName, 'UTF-8');
    generateSourceCodeByTags(swagger, swaggerFileName);
    console.log('--------------------------------------');
    console.log('JAVASCRIPT CODE GENERATION COMPLETED');
}


/*HELPER FUNCTIONS*/
function readFileToJSON(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'UTF-8'));
}

function writeToFile(fileName, content) {
    fs.writeFile(fileName, content, function (err) {
        if (err) {
            return console.log(err);
        }
    });
    console.log('FILE ' + fileName + ' generated.');
}

function getFileName(filePath) {
    var filePathWithDirs = filePath.split('/');
    if (filePathWithDirs === []) {
        return '';
    }
    var fileName = filePathWithDirs[filePathWithDirs.length - 1];
    var lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex === -1 ? fileName : fileName.substr(0, lastDotIndex);
}

function capitalizeFirstLetter(s) {
    return s.replace(/^\w/, c => c.toUpperCase());
}

function getTagName(path) {
    var pathObject = path[1];
    var methodObject = Object.entries(pathObject)[0][1];
    var tags = methodObject.tags || [];
    return tags[0] || 'NotTaggedEndpoints';
}

function mapPathByTag(result, path) {
    var tag = getTagName(path);
    if (result[tag] === undefined) {
        result[tag] = [];
    }
    result[tag].push({[path[0]]: path[1]});
}

function createMapFromTagToPathList(swaggerJson) {
    let result = {};
    var paths = Object.entries(swaggerJson.paths);
    for (var path of paths) {
        mapPathByTag(result, path);
    }
    return result;
}

function generateOneGroupByTag(groupedPaths) {
    var group = [];
    for (var path of groupedPaths[1]) {
        var definitePathObject = Object.entries(path)[0];
        var singleResult = {
            pathName: definitePathObject[0],
            pathObject: definitePathObject[1],
            tag: capitalizeFirstLetter(groupedPaths[0]),
        };
        group.push(singleResult)
    }
    return group;
}

function groupPathsByTags(swagger) {
    var mapFromTagToPathList = createMapFromTagToPathList(swagger);
    var groupedPathsList = Object.entries(mapFromTagToPathList);
    var result = [];
    for (var groupedPaths of groupedPathsList) {
        result.push(generateOneGroupByTag(groupedPaths));
    }
    return result;
}

function gitClone(filesystemPath, repoUrl, callbackFunction) {
    fse.remove(filesystemPath).then(function () {
        var entry;

        nodegit.Clone(
            repoUrl,
            filesystemPath,
            {
                fetchOpts: {
                    callbacks: {
                        certificateCheck: function () {
                            // github will fail cert check on some OSX machines
                            // this overrides that check
                            return 0;
                        }
                    }
                }
            })
            .then(function (repo) {
                return repo.getMasterCommit();
            })
            .then(function (commit) {
                return commit.getEntry("README.md");
            })
            .then(function (entryResult) {
                entry = entryResult;
                return entry.getBlob();
            })
            .done(function (blob) {
                console.log('Repo cloned');
                callbackFunction(SWAGGER_FILE_NAME);
            });
    });
}

function gitPull(repoFilePath, functionCallback) {

    var repository;

    // Open a repository that needs to be fetched and fast-forwarded
    nodegit.Repository.open(repoFilePath)
        .then(function (repo) {
            repository = repo;

            return repository.fetchAll({
                callbacks: {
                    credentials: function (url, userName) {
                        return nodegit.Cred.sshKeyFromAgent(userName);
                    },
                    certificateCheck: function () {
                        return 0;
                    }
                }
            });
        })
        // Now that we're finished fetching, go ahead and merge our local branch
        // with the new one
        .then(function () {
            return repository.mergeBranches("master", "origin/master");
        })
        .done(function () {
            console.log("Git pull done!");
            functionCallback(SWAGGER_FILE_NAME);
        });
}