History
=======

## 0.1.1

* Fix bug wherein `gitignore-parser` did not correctly match `.gitignore` glob
  patterns like `git` actually does. Switch to `parse-gitignore` library and
  add regression tests.
  [#9](https://github.com/FormidableLabs/denim/issues/9)

## 0.1.0

* Add `_templatesFilter` default derived special variable support.
  [#4](https://github.com/FormidableLabs/denim/issues/4)
* Change internal `.gitignore` default filtering to use the resolved path name
  (e.g., `"foo/bar.txt"`) instead of unexpanded template path (e.g.,
  `"{{varForFoo}}/bar.txt"`).

## 0.0.3

* Publish `test/` for other project usage.

## 0.0.2

* Add `package.json:main`.

## 0.0.1

* Initial release.

[@ryan-roemer]: https://github.com/ryan-roemer
