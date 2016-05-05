for file in $(find . -name "*.js"); do
    lebab $file -o $file
done