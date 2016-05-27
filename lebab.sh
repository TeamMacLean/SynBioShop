#!/usr/bin/env bash
for file in $(find . -name "*.js"); do
if [[ $file != *"public/"* ]] && [[ $file != *"node_modules/"* ]]; then
#echo $file
    lebab $file -o $file
fi
done