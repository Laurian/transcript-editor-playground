# ls ../../node_modules/draft-js/lib/*.js | grep -v DraftEditorLeaf | awk '{print "cp "$1" ."}' | sh
ls ../../node_modules/draft-js/lib/*.js | awk '{print "cp "$1" ."}' | sh
