[![Travis Status][trav_img]][trav_site]
[![Coverage Status][cov_img]][cov_site]

Denim
===================

A lightweight, npm-based template engine.


<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Installation](#installation)
- [Usage](#usage)
  - [Installing from a Relative Path on the Local Filesystem](#installing-from-a-relative-path-on-the-local-filesystem)
  - [Automating Prompts](#automating-prompts)
- [Template Modules](#template-modules)
  - [Templates Module Data](#templates-module-data)
    - [Special Variables](#special-variables)
    - [Imports and Dependencies](#imports-and-dependencies)
    - [User Prompts](#user-prompts)
    - [Derived Data](#derived-data)
  - [Special Data and Scenarios](#special-data-and-scenarios)
    - [`.npmignore`, `.gitignore`](#npmignore-gitignore)
  - [Templates Directory Ingestion](#templates-directory-ingestion)
  - [Template Parsing](#template-parsing)
  - [File Name Parsing](#file-name-parsing)
- [Tips, Tricks, & Notes](#tips-tricks--notes)
  - [npmrc File](#npmrc-file)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Installation

Install this package as a global dependency.

```sh
$ npm install -g denim
```

Although we generally disfavor global installs, this tool _creates_ new projects
from scratch, so you have to start somewhere...


## Usage

`denim` can initialize any package that `npm` can
[install](https://docs.npmjs.com/cli/install), including npm, GitHub, file, etc.

Invocation:

```sh
$ denim [flags] <module>
```

Flags:

```
  --help
  --version
  --prompts
```

Examples:

```sh
$ denim templates-module
$ denim templates-module@0.2.0
$ denim FormidableLabs/templates-module
$ denim FormidableLabs/templates-module#v0.2.0
$ denim git+ssh://git@github.com:FormidableLabs/templates-module.git
$ denim git+ssh://git@github.com:FormidableLabs/templates-module.git#v0.2.0
$ denim /FULL/PATH/TO/templates-module
```

Internally, `denim` utilizes [`npm pack`](https://docs.npmjs.com/cli/pack)
to download (but not install) a templates package from npm, GitHub, file, etc.
There is a slight performance penalty for things like local files which have to
be compressed and then expanded again, but we gain the very nice benefit of
allowing `denim` to install anything `npm` can in exactly the same
manner that `npm` does.

### Installing from a Relative Path on the Local Filesystem

One exception to the "install like `npm` does" rule is installation from the
**local filesystem**. Internally, `denim` creates a temporary directory
to expand the download from `npm pack` and executes the process in that
directory, meaning that relative paths to a target modules are now incorrect.

Accordingly, if you _want_ to simulate a relative path install, you can try
something like:

```sh
# Mac / Linux
$ denim "${PWD}/../templates-module"

# Windows
$ denim "%cd%\..\templates-module"
```

### Automating Prompts

To facilitate automation, notably testing a module by generating a project
with `denim` and running the project's tests as part of CI, there is a
special `--prompts=JSON_OBJECT` flag that skips the actual input prompts and
injects fields straight from a JSON object.

```sh
$ denim <module> \
  --prompts'{"name":"bob","quest":"popcorn","destination":"my-project"}'
```

Note that _all_ required fields must be provided in the JSON object, no defaults
are used, and the init process will fail if there are any missing fields.
**Tip**: You will need a `destination` value, which is added to all prompts.


## Template Modules

Templates are created within a first class `npm` module. It could be your
projects shared utilities module or a standalone template bootstrap module.
The main point is creating something `npm`-installable that is lightweight for
bootstrapping your templated projects.

A `denim` project is controlled with:

* **`denim.js`**: A control file for user prompts and data.
* **`templates/`**: A directory of templates to inflate during initialization.
  This directory can be configured with user prompts / data by setting the
  special `_templatesDir` variable to something different than `"templates"`.

For example, in `templates-module`, we have a control file and templates
as follows:

```
denim.js
templates/
  .babelrc
  .editorconfig
  .travis.yml
  CONTRIBUTING.md
  demo/app.jsx
  demo/index.html
  LICENSE.txt
  package.json
  README.md
  src/components/{{componentPath}}.jsx
  src/index.js
  test/client/main.js
  test/client/spec/components/{{componentPath}}.spec.jsx
  test/client/test.html
  {{_gitignore}}
  {{_npmignore}}
```

### Templates Module Data

Packages provide data for template expansion via a `denim.js` file in the
root of the module. The structure of the file is:

```js
module.exports = {
  destination:  // A special prompt for output destination directory.
  prompts:      // Questions and responses for the user
  derived:      // Other fields derived from the data provided by the user
};
```

Note that `denim` requires `destination` output directories to not exist
before writing for safety and initialization sanity.

#### Special Variables

There are several default data fields provided by denim that can be overridden
in `denim.js` configuration files. A brief list:

* _Control_
    * `_templatesDir` (`"templates"`): The directory root of the templates to
      use during inflation.
    * `_templatesFilter` (_a noop function_): A function with the signature
      `(filePath, included)` where `filePath` is the resolved path to a file
      (relative to templates directory), and `included` is a boolean indicating
      whether or not denim would ordinarily include it (e.g., it is not excluded
      by the `.gitignore`). An overriding function should return `true` or
      `false` based on custom logic and can optionally use the `included`
      parameter from denim's default logic.
* _File naming helpers_
    * `_gitignore` (`".gitignore"`)
    * `_npmignore` (`".npmignore"`)
    * `_npmrc` (`".npmrc"`):
    * `_eslintrc` (`".eslintrc"`)

#### Imports and Dependencies

The `denim.js` file is `require`-ed from a temporary `extracted` directory
containing the full module. However, an `npm install` is not run in the
module directory prior to starting the initialization process. This means
that you can `require` in:

* Files contained in the module itself.
* Any standard node libraries. (E.g., `require("path")`, `require("fs")`).

Unfortunately, you cannot require third party libraries or things that may
be found in `<module>/node_modules/`. (E.g., `require("lodash")`).

This is a good thing, because the common case is that you will need nearly
_none_ of the dependencies in `denim.js` prompting that are used in the module
itself, so `denim` remains lightening quick by _not_ needing to do any
`npm install`-ing.

#### User Prompts

User prompts and responses are ingested using [inquirer][]. The `prompts` field
of the `denim.js` object can either be an _array_ or _object_ of inquirer
[question objects][inq-questions]. For example:

```js
module.exports = {
  // Destination directory to write files to.
  //
  // This field is deep merged and added _last_ to the prompts so that module
  // authors can add `default` values or override the default message. You
  // could further override the `validate` function, but we suggest using the
  // existing default as it checks the directory does not already exist (which
  // is enforced later in code).
  destination: {
    default: function (data) {
      // Use the early `name` prompt as the default value for our dest directory
      return data.name;
    }
  },

  prompts: [
    {
      name: "name",
      message: "What is your name?",
      validate: function (val) {
        // Validate functions return `true` if valid.
        // If invalid, return `false` or an error message.
        return !!val.trim() || "Must enter a name!";
      }
    },
    {
      name: "quest",
      message: "What is your quest?"
    }
  ]
};
```

`denim` provides a short-cut of placing the `name` field as the key
value for a `prompts` object instead of an array:

```js
module.exports = {
  prompts: {
    name: {
      message: "What is your name?",
      validate: function (val) { return !!val.trim() || "Must enter a name!"; }
    },
    quest: {
      message: "What is your quest?"
    }
  }
};
```

**Note - Async**: Inquirer has some nice features, one of which is enabling
functions like `validate` to become async by using `this.async()`. For
example:

```js
name: {
  message: "What is your name?",
  validate: function (val) {
    var done = this.async();

    // Let's wait a second.
    setTimeout(function () {
      done(!!val.trim() || "Must enter a name!")
    }, 1000);
  }
}
```

#### Derived Data

Module authors may not wish to expose _all_ data for user input. Thus,
`denim` supports a simple bespoke scheme for taking the existing user
data and adding derived fields.

The `derived` field of the `denim.js` object is an object of functions with
the signature:

```js
derived: {
  // - `data`     All existing data from user prompts.
  // - `callback` Callback of form `(error, derivedData)`
  upperName: function (data, cb) {
    // Uppercase the existing `name` data.
    cb(null, data.name.toUpperCase());
  }
}
```

### Special Data and Scenarios

#### `.npmignore`, `.gitignore`

**The Problem**

Special files like `.npmrc`, `.npmignore`, and `.gitignore` in a `templates/`
directory are critical to the correct publishing / git lifecycle of a created
project. However, publishing `templates/` to npm as part of publishing the
module and even initializing off of a local file path via `npm pack` does not
work well with the basic layout of:

```
templates/
  .gitignore
  .npmignore
  .npmrc
```

The problem is that the `.npmignore` affects and filters out files that will
be available for template use in an undesirable fashion. For example, in
`templates-module` which has an `.npmignore` which includes:

```
demo
test
.editor*
.travis*
```

natural `npm` processes would exclude all of the following template files:

```
templates/.editorconfig
templates/.travis.yml
templates/test/client/main.js
templates/test/client/spec/components/{{componentPath}}.spec.jsx
templates/test/client/test.html
templates/demo/app.jsx
templates/demo/index.html
```

Adding even more complexity to the situation is the fact that if `npm` doesn't
find a `.npmignore` on publishing or `npm pack` it will rename `.gitignore` to
`.npmignore`.

**The Solution**

To address this, we have special `derived` values built in by default to
`denim`. You do _not_ need to add them to your `denim.js`:

* `{{_gitignore}}` -> `.gitignore`
* `{{_npmignore}}` -> `.npmignore`
* `{{_npmrc}}` -> `.npmrc`
* `{{_eslintrc}}` -> `.eslintrc`

In your module `templates` directory you should add any / none of these files
with the following names instead of their real ones:

```
templates/
  {{_gitignore}}
  {{_npmignore}}
  {{_npmrc}}
  {{_eslintrc}}
```

As a side note for your git usage, this now means that `templates/.gitignore`
doesn't control the templates anymore and your module's root `.gitignore`
must appropriately ignore files in `templates/` for git commits.


### Templates Directory Ingestion

As a preliminary matter, `templates/` is the out-of-the box templates directory
default for a special prompts variable `_templatesDir`. You can override this in
an `denim.js` either via `prompts` (allowing a user to pick a value) or `derived`
data. Either of these approaches can choose 1+ different directories to find
templates than the default `templates/`.

`denim` mostly just walks the templates directory of a module looking
for any files with the following features:

* An empty templates directory is permitted, but a non-existent one will produce
  an error.
* If an `<_templatesDir>/.gitignore` file is found, the files matched in the
  templates directory will be filtered to ignore any `.gitignore` glob matches.
  This filtering is done at _load_ time before file name template strings are
  expanded (in case that matters).

`denim` tries to intelligently determine if files in the templates
directory are actually text template files with the following heuristic:

1. Inspect the magic numbers for known text files and opportunistically the
   byte range of the file buffer with https://github.com/gjtorikian/isBinaryFile.
   If binary bytes detected, don't process.
2. Inspect the magic numbers for known binary types with
   https://github.com/sindresorhus/file-type
   If known binary type detected, don't process.
3. Otherwise, try to process as a template.

If this heuristic approach proves too complicated / problematic, we'll
reconsider the approach.

### Template Parsing

`denim` uses Lodash templates, with the following customizations:

* ERB-style templates are the only supported format. The new ES-style template
  strings are disabled because the underlying processed code is likely to
  include JS code with ES templates.
* HTML escaping by default is disabled so that we can easily process `<`, `>`,
  etc. symbols in JS.

The Lodash templates documentation can be found at:
https://github.com/lodash/lodash/blob/master/lodash.js#L12302-L12365

And, here's a quick refresher:

**Variables**

```js
var compiled = _.template("Hi <%= user %>!");
console.log(compiled({ user: "Bob" }));
// => "Hi Bob!"
```

```js
var compiled = _.template(
  "Hi <%= _.map(users, function (u) { return u.toUpperCase(); }).join(\", \") %>!");
console.log(compiled({ users: ["Bob", "Sally"] }));
// => Hi BOB, SALLY!
```

**JavaScript Interpolation**

```js
var compiled = _.template(
  "Hi <% _.each(users, function (u, i) { %>" +
    "<%- i === 0 ? '' : ', ' %>" +
    "<%- u.toUpperCase() %>" +
  "<% }); %>!");
console.log(compiled({ users: ["Bob", "Sally"] }));
// => Hi BOB, SALLY!
```

### File Name Parsing

In addition file _content_, `denim` also interpolates and parses file
_names_ using an alternate template parsing scheme, inspired by Mustache
templates. (The rationale for this is that ERB syntax is not file-system
compliant on all OSes).

So, if we have data: `packageName: "whiz-bang-component"` and want to create
a file-system path:

```
src/components/whiz-bang-component.jsx
```

The source module should contain a full file path like:

```
templates/src/components/{{packageName}}.jsx
```

`denim` will validate the expanded file tokens to detect clashes with
other static file names provided by the generator.


## Tips, Tricks, & Notes

### npmrc File

If you use Private npm, or a non-standard registry, or anything leveraging a
custom [`npmrc`](https://docs.npmjs.com/files/npmrc) file, you need to set
a **user** (`~/.npmrc`) or **global** (`$PREFIX/etc/npmrc`) npmrc file.

`denim` relies on `npm pack` under the hood and runs from a temporary
directory completely outside of the current working directory. So, while
`npm info <module>` or `npm pack <module>` would work just fine with an
`.npmrc` file in the current working directory, `denim` will not.


[inquirer]: https://github.com/SBoudrias/Inquirer.js
[inq-questions]: https://github.com/SBoudrias/Inquirer.js#question
[trav_img]: https://api.travis-ci.org/FormidableLabs/denim.svg
[trav_site]: https://travis-ci.org/FormidableLabs/denim
[cov_img]: https://img.shields.io/coveralls/FormidableLabs/denim.svg
[cov_site]: https://coveralls.io/r/FormidableLabs/denim
