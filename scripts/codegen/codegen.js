var fs = require('fs');
var CodeGen = require('swagger-typescript-codegen').CodeGen;
var nodegit = require("nodegit");
var fse = require("fs-extra");
yaml = require('js-yaml');


/*VARIABLES*/
var WORK_DIR = 'scripts/codegen/';
var PRODUCT_NAMES = ['rule-engine', 'retail-lending', 'product-catalogue'];
var getSwaggerFileName = productName => productName + '/src/main/resources/contract/v1.yaml';
var OUTPUT_DIR = 'src/generated/client/';
var getRepoFilesystemPath = productName => WORK_DIR + productName;
var getRepoUrl = productName => `git@gitlab.starboost.banka.rba:applications/boosters/${productName}.git`;


/*RUN SCRIPT*/
function generateCodeForProduct(productName) {
    if (fs.existsSync(getRepoFilesystemPath(productName))) {
        gitPull(getRepoFilesystemPath(productName), generateSourceCodeFromSwagger, productName);
    } else {
        gitClone(getRepoFilesystemPath(productName), getRepoUrl(productName), generateSourceCodeFromSwagger, productName);
    }
}

for (var productName of PRODUCT_NAMES) {
    generateCodeForProduct(productName);
}


/*SCRIPT*/
function generateSourceCodeByTags(swagger, productName) {
    for (var group of groupPathsByTags(swagger)) {
        var oneGroupOfPaths = {};
        var tagName = '';
        for (var pathRepresentation of group) {
            oneGroupOfPaths[pathRepresentation.pathName] = pathRepresentation.pathObject;
            tagName = pathRepresentation.tag;
        }
        swagger.paths = oneGroupOfPaths;
        generateSourceCode(tagName, swagger, productName);
    }
}

function join(path1, path2) {
    path1 = path1 || '';
    path2 = path2 || '';
    var lastChar = path1.charAt(path1.length - 1);
    var firstChar = path2.charAt(path2.length - 1);
    if (lastChar === '/' && firstChar === '/') {
        path1 = path1.substr(0, path1.length - 1);
    }
    if (lastChar !== '/' && firstChar !== '/') {
        path1 = path1 + '/';
    }
    return path1 + path2;
}

const HOST_MAPPING = {
    ['product-catalogue']:  'product-catalogue.dev.apps.banka.rba:80',
    ['retail-lending']:  'retail-lending.dev.apps.banka.rba:80',
    ['rule-engine']:  'rule-engine.dev.apps.banka.rba:80',
};

function modifyBasePath(swagger, productName) {
    var basePath2 = swagger.basePath || '';
    swagger.basePath = join(basePath2, 'a');
    swagger.basePath = swagger.basePath.substr(0, swagger.basePath.length - 1);
    swagger.host = HOST_MAPPING[productName];
}

function generateSourceCode(generatedClassName, swagger, productName) {
    modifyBasePath(swagger, productName);
    var generatedCode = CodeGen.getTypescriptCode({
        className: generatedClassName,
        swagger: swagger
    });
    var outputFilePath = OUTPUT_DIR + generatedClassName + 'Client.ts';
    writeToFile(outputFilePath, generatedCode);
}

function generateSourceCodeFromSwagger(swaggerFileName, productName) {
    console.log('JAVASCRIPT CODE GENERATION FROM SWAGGER');
    console.log('--------------------------------------');
    console.log('Generated files: ');
    var swagger = readFileToJSON(WORK_DIR + swaggerFileName, 'UTF-8');
    generateSourceCodeByTags(swagger, productName);
    console.log('--------------------------------------');
    console.log('JAVASCRIPT CODE GENERATION COMPLETED');
}


/*HELPER FUNCTIONS*/
function readFileToJSON(filePath) {
    var swagger = yaml.safeLoad(fs.readFileSync(filePath, 'UTF-8'));
    return yaml.safeLoad(fs.readFileSync(filePath, 'UTF-8'));
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

function gitClone(filesystemPath, repoUrl, callbackFunction, productName) {
    fse.remove(filesystemPath).then(function () {
        var entry;

        nodegit.Clone(
            repoUrl,
            filesystemPath,
            {
                fetchOpts: {
                    callbacks: {
                        credentials: function (url, userName) {
                            return nodegit.Cred.sshKeyFromAgent(userName);
                        },
                        certificateCheck: function () {
                            return 0;
                        }
                    }
                }
            }).catch(function(err) { console.log(err); })
            .then(function (repo) {
                return repo.checkoutBranch('dev');
            })
            .then(function (commit) {
                return commit.getEntry("README.md");
            })
            .then(function (entryResult) {
                entry = entryResult;
                return entry.getBlob();
            })
            .done(function (blob) {
                console.log('');
                console.log('');
                console.log('Project: ' + productName);
                console.log('Repo cloned');
                callbackFunction(getSwaggerFileName(productName), productName);
            });
    });
}

function gitPull(repoFilePath, functionCallback, productName) {
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
            return repository.mergeBranches("dev", "origin/dev");
        })
        .done(function () {
            console.log('');
            console.log('');
            console.log('Project: ' + productName);
            console.log("Git pull done!");
            functionCallback(getSwaggerFileName(productName), productName);
        });
}
