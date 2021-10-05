#!/bin/bash
for i in `seq -w 00 1 360`
do
	convert ozekon-20x20.png -background 'rgba(0,0,0,0)' -rotate $i -gravity Center -extent 20x20+0+0 +repage logo-rotated/ozekon-20x20-$i.png
done
