NovoLoko Curated H3 CSV Pack
============================

These nine files power the built-in dropdowns in NovoLoko H3 Prompt Enhancer.
Each row contains a short readable name and one complete prompt sentence. The
node inserts the sentence without rewriting it.

Normal use: choose dropdown entries directly on the node. No CSV loader nodes
are needed. Advanced users may connect a STRING to an *_override socket; a
connected non-empty override replaces only that category's dropdown sentence.

Edit or add rows using the two headers: name,prompt. Keep names unique inside
each file and write prompt values as complete H3-ready sentences.
