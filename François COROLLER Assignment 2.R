
library(ggplot2)
library(tidyverse)
library(mapdata)
library(maps)

library(ggplot2)
library(dplyr)
require(maps)
require(viridis)
theme_set(
  theme_void()
)


um <- read.csv("C:/Users/youss/Downloads/unicef_metadata (4).csv")
um
colnames(um)[colnames(um)=="country"] <- "region"

ui1 <- read.csv("C:/Users/youss/Downloads/unicef_indicator_1 (2).csv")
ui1

ui2 <- read.csv("C:/Users/youss/Downloads/unicef_indicator_2.csv")
ui2

world_map <- map_data("world")
ggplot(world_map, aes(x = long, y = lat, group = group)) +
  geom_polygon(fill="lightgray", colour = "white")

um <- left_join(world_map,um,by="region")

map1 <- ggplot(um, aes(x=long, y=lat, group=group)) + geom_polygon(aes(fill=GDP.per.capita..constant.2015.US..),color='black')
map1
um

bar_chart<-ggplot(data=ui1, aes(x=sex, y=obs_value)) +
  geom_bar(stat="identity",position=position_dodge(), fill="steelblue")+
  theme_minimal()
  
bar_chart + guides (fill = guide_legend(ncol = 1))+
  xlab("sex")+
  ggtitle("obs_value by sex")+ theme(legend.position = "none")


line_chart <- ggplot(um, aes(x=year, y=Population..total)) +
  geom_line() + 
  xlab("")
line_chart+ 
  theme(
    plot.margin = margin(1, 1, 1, 1, "cm"),
    panel.background = element_rect(fill = "white"),
    plot.background = element_rect(
      fill = "grey90",
      colour = "black"
    )
  )

b<-ggplot(um, aes(x=GDP.per.capita..constant.2015.US..., y=Population..total)) + geom_point()
b

mtcars$cyl <- as.factor(mtcars$cyl)
head(mtcars)
Scater_regre<-ggplot(mtcars, aes(x=wt, y=mpg)) + 
  geom_point()+
  geom_smooth(method=lm)+ geom_text(label=rownames(mtcars))+ggtitle("Mtcar data wt by mpg") +
  xlab("wt") + ylab("mpg")
Scater_regre
