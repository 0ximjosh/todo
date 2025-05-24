# TODO

Well, not todo, thats just the name of the tool.

`todo` is a cli helper that lets you quickly upload your todos in your code to
linear. I found that my flow was much better when i just put todos in my code
for where i need to work next when iterating really fast, and this lets my team
stay up to date with where im at.

## Install

As of now, unfortunately, this is a typescript script cli tool, when i get more
time i would love to do it in go and add a bunch of features, but o well.

Just clone down the repo and use `bun i && bun link && bun link todo`, and you
should be good to go.

> The first time you run the script, youll be prompted to setup your inital
> config. This is always editable later on if you need.

## Commands

There is really only one commands, with one optional flag. Calling `todo`
normally will just run the entire script and upload and update everything on
linear. If you want to get a preview of what your current TODOs are in your
code, you can use the `todo --dry-run`.

## Expected TODO format

As of now, only languages that use `//` to start comments are supported. The
script will pick up a TODO per line for every line that is commented under a
TODO comment. Some examples may help.

```go
code code code
// TODO 
// two - picked up
// three - picked up

// Code Comment - not picked up

// TODO oneliner - picked up
code code code
code code code
// TODO one liner - picked up
// and multiline - picked up

code code code // TODO even at the end of lines - picked up
```

## Contributions

I just spun this up in an afternoon after getting frustrated with myself for not
using linear enough. There are endless features that could be added to this, and
im open to any PRs.
