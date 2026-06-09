# Build each topic in topics/ into its own PDF in build/, using Tectonic.
#
#   make            build every topic PDF
#   make build/foo.pdf   build a single topic
#   make watch      rebuild on change
#   make clean      remove build/
#   make list       list the PDFs that would be built

TOPICS := $(wildcard topics/*.tex)
PDFS   := $(patsubst topics/%.tex,build/%.pdf,$(TOPICS))
SHARED := $(wildcard topics/*.sty)

.PHONY: all clean watch list
all: $(PDFS)

build/%.pdf: topics/%.tex $(SHARED)
	@mkdir -p build
	tectonic --keep-logs --synctex --outdir build $<

watch:
	tectonic --watch --outdir build $(TOPICS)

list:
	@echo $(PDFS)

clean:
	rm -rf build
